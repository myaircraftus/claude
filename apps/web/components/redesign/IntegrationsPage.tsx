"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useIntegrationStore,
  type IntegrationId,
} from "./integrationStore";

type Category =
  | "Flight Scheduling"
  | "Live Tracking"
  | "Maintenance & Data"
  | "Accounting";

interface Integration {
  id: IntegrationId;
  name: string;
  tagline: string;
  desc: string;
  category: Category;
  logoUrl?: string;
  docsUrl?: string;
  syncFields: string[];
  featured?: boolean;
  credentialLabel?: string;
  credentialPlaceholder?: string;
  helperCopy?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    id: "flightschedulepro",
    name: "Flight Schedule Pro",
    tagline: "Scheduling and fleet dispatch for training ops",
    desc: "Sync aircraft availability, Hobbs/Tach changes, and scheduler-driven maintenance holds so dispatch and records stay aligned.",
    category: "Flight Scheduling",
    logoUrl: "https://logo.clearbit.com/flightschedulepro.com",
    docsUrl: "https://flightschedulepro.com",
    syncFields: ["Aircraft availability", "Hobbs / Tach", "Maintenance holds", "Fleet status"],
    featured: true,
  },
  {
    id: "flightcircle",
    name: "Flight Circle",
    tagline: "Cloud scheduling for school and rental fleets",
    desc: "Keep your active fleet, maintenance blocks, and utilization totals current between Flight Circle and myaircraft.us.",
    category: "Flight Scheduling",
    logoUrl: "https://logo.clearbit.com/flightcircle.com",
    docsUrl: "https://flightcircle.com",
    syncFields: ["Fleet details", "Hobbs / Tach", "Aircraft holds"],
  },
  {
    id: "schedulemaster",
    name: "ScheduleMaster",
    tagline: "Multi-base scheduling and dispatch",
    desc: "Prepare aircraft, utilization, and maintenance-block data for ScheduleMaster-style scheduler integrations.",
    category: "Flight Scheduling",
    logoUrl: "https://logo.clearbit.com/schedulemaster.com",
    docsUrl: "https://schedulemaster.com",
    syncFields: ["Fleet records", "Scheduler holds", "Utilization totals"],
  },
  {
    id: "schedaero",
    name: "Schedaero",
    tagline: "Charter dispatch with maintenance awareness",
    desc: "Sync maintenance holds and aircraft readiness so charter schedulers never book unavailable aircraft.",
    category: "Flight Scheduling",
    logoUrl: "https://logo.clearbit.com/schedaero.com",
    docsUrl: "https://www.schedaero.com",
    syncFields: ["Aircraft status", "AOG holds", "Dispatch availability"],
  },
  {
    id: "myflightbook",
    name: "MyFlightbook",
    tagline: "Pilot and aircraft activity sync",
    desc: "Bring aircraft activity and flight-time updates into myaircraft.us to keep records and reminders current.",
    category: "Flight Scheduling",
    logoUrl: "https://logo.clearbit.com/myflightbook.com",
    docsUrl: "https://myflightbook.com",
    syncFields: ["Flight time", "Aircraft activity", "Utilization history"],
  },
  {
    id: "aerocrew",
    name: "Aero Crew Solutions",
    tagline: "Crew and operations scheduling",
    desc: "Coordinate crew-facing operations data with aircraft availability and maintenance state.",
    category: "Flight Scheduling",
    logoUrl: "https://logo.clearbit.com/aerocrewsolutions.com",
    docsUrl: "https://aerocrewsolutions.com",
    syncFields: ["Crew schedules", "Aircraft status", "Operational readiness"],
  },
  {
    id: "fltplan",
    name: "FltPlan.com",
    tagline: "Flight planning with utilization context",
    desc: "Use flight activity and dispatch context to keep Hobbs/Tach usage aligned with aircraft records.",
    category: "Flight Scheduling",
    logoUrl: "https://logo.clearbit.com/fltplan.com",
    docsUrl: "https://fltplan.com",
    syncFields: ["Flight activity", "Route utilization", "Block time context"],
  },
  {
    id: "avplan",
    name: "AvPlan EFB",
    tagline: "Electronic flight bag and aircraft activity",
    desc: "Capture block-time and aircraft activity context from AvPlan-connected operations.",
    category: "Flight Scheduling",
    logoUrl: "https://logo.clearbit.com/avplan-efb.com",
    docsUrl: "https://www.avplan-efb.com",
    syncFields: ["Block times", "Flight activity", "Utilization context"],
  },
  {
    id: "flightaware",
    name: "FlightAware AeroAPI",
    tagline: "Live fleet awareness and activity tracking",
    desc: "Track fleet activity and movement context for aircraft status, utilization, and alerts.",
    category: "Live Tracking",
    logoUrl: "https://logo.clearbit.com/flightaware.com",
    docsUrl: "https://flightaware.com/aeroapi",
    syncFields: ["Live position", "Activity status", "Arrival / departure alerts"],
    featured: true,
  },
  {
    id: "adsbexchange",
    name: "ADS-B Exchange",
    tagline: "Open ADS-B fleet tracking",
    desc: "Use unfiltered ADS-B tracking signals to enrich aircraft activity views and operational context.",
    category: "Live Tracking",
    logoUrl: "https://logo.clearbit.com/adsbexchange.com",
    docsUrl: "https://www.adsbexchange.com",
    syncFields: ["Position", "Altitude", "Speed", "Tracking history"],
  },
  {
    id: "flightradar",
    name: "FlightRadar24 Business",
    tagline: "Global flight-tracking visibility",
    desc: "Feed activity telemetry and fleet playback context into ops and aircraft records views.",
    category: "Live Tracking",
    logoUrl: "https://logo.clearbit.com/flightradar24.com",
    docsUrl: "https://www.flightradar24.com/commercial-services",
    syncFields: ["Live activity", "Fleet playback", "Arrival / departure history"],
  },
  {
    id: "camp",
    name: "CAMP Systems",
    tagline: "Airworthiness and maintenance forecasting",
    desc: "Bring in maintenance forecasts, due items, and compliance context to keep reminders and ops dashboards current.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/campsystems.com",
    docsUrl: "https://www.campsystems.com",
    syncFields: ["Due items", "Compliance forecasts", "Maintenance planning"],
    featured: true,
  },
  {
    id: "flightdocs",
    name: "Flightdocs",
    tagline: "Maintenance tracking and compliance records",
    desc: "Normalize customers, aircraft, work orders, squawks, and compliance data from Flightdocs into the myaircraft data model.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/flightdocs.com",
    docsUrl: "https://www.flightdocs.com",
    syncFields: ["Customers", "Aircraft", "Work orders", "Squawks", "Maintenance history"],
    featured: true,
  },
  {
    id: "traxxall",
    name: "Traxxall",
    tagline: "Fleet maintenance management",
    desc: "Prepare a normalized sync path for aircraft, work orders, discrepancies, and maintenance status from Traxxall.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/traxxall.com",
    docsUrl: "https://www.traxxall.com",
    syncFields: ["Aircraft", "Tasks", "Work orders", "Discrepancies", "Component status"],
  },
  {
    id: "quantum",
    name: "Quantum Control",
    tagline: "MRO ERP and shop operations",
    desc: "Support customer, work order, parts, and invoice normalization for repair-station workflows.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/quantum-control.com",
    docsUrl: "https://www.quantum-control.com",
    syncFields: ["Customers", "Work orders", "Parts", "Invoices"],
  },
  {
    id: "corridor",
    name: "Corridor",
    tagline: "CAMO and fleet maintenance oversight",
    desc: "Import structured maintenance schedules, component life tracking, and work-scope visibility into myaircraft.us.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/rusada.com",
    docsUrl: "https://www.rusada.com",
    syncFields: ["Aircraft", "Scheduled tasks", "Component life", "Work orders"],
  },
  {
    id: "atphub",
    name: "ATP Aviation Hub",
    tagline: "Technical publications and compliance references",
    desc: "Connect reference data around manuals, ADs, and service publications to maintenance records and work execution.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/atp.com",
    docsUrl: "https://www.atp.com",
    syncFields: ["Technical references", "AD / SB context", "Compliance metadata"],
  },
  {
    id: "winair",
    name: "WinAir",
    tagline: "Aviation MRO and inventory management",
    desc: "Create an extensible sync layer for customers, aircraft, work orders, and inventory-linked maintenance data.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/winair.ca",
    docsUrl: "https://www.winair.ca",
    syncFields: ["Customers", "Aircraft", "Work orders", "Inventory"],
  },
  {
    id: "logbookpro",
    name: "Logbook Pro",
    tagline: "Electronic flight and maintenance activity",
    desc: "Bring historical activity and airframe time context into the aircraft record timeline.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/logbookpro.com",
    docsUrl: "https://www.logbookpro.com",
    syncFields: ["Flight history", "Aircraft times", "Activity records"],
  },
  {
    id: "smartaviation",
    name: "Smart Aviation",
    tagline: "Maintenance scheduling and compliance tracking",
    desc: "Normalize due items, maintenance tasks, and discrepancy queues for operational review.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/smartaviation.com",
    docsUrl: "https://smartaviation.com",
    syncFields: ["Due items", "Maintenance tasks", "Squawks", "Aircraft status"],
  },
  {
    id: "mxcommander",
    name: "Mx Commander",
    tagline: "Mobile-first line maintenance workflows",
    desc: "Prepare field-driven work order, labor, and parts-request synchronization for mechanic operations.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/mxcommander.com",
    docsUrl: "https://mxcommander.com",
    syncFields: ["Work orders", "Labor entries", "Parts requests", "Aircraft status"],
  },
  {
    id: "safetyculture",
    name: "SafetyCulture",
    tagline: "Digital inspections and audit findings",
    desc: "Move inspection findings and audit evidence into squawk and discrepancy workflows.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/safetyculture.com",
    docsUrl: "https://safetyculture.com",
    syncFields: ["Inspection reports", "Audit findings", "Compliance issues"],
  },
  {
    id: "aviobook",
    name: "AvioBook Maintenance",
    tagline: "Connected fleet technical log context",
    desc: "Support technical log, deferred item, and fleet maintenance normalization from AvioBook-linked operations.",
    category: "Maintenance & Data",
    logoUrl: "https://logo.clearbit.com/aviobook.aero",
    docsUrl: "https://www.aviobook.aero",
    syncFields: ["Tech log entries", "Deferred items", "Aircraft activity"],
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    tagline: "Push invoices into accounting without double entry",
    desc: "Queue myaircraft invoice exports for QuickBooks so customer, aircraft, line items, totals, and notes are ready for accounting handoff.",
    category: "Accounting",
    logoUrl: "https://logo.clearbit.com/quickbooks.intuit.com",
    docsUrl: "https://quickbooks.intuit.com",
    syncFields: ["Invoice number", "Customer", "Aircraft reference", "Line items", "Taxes", "Totals"],
    featured: true,
    credentialLabel: "OAuth connection",
    credentialPlaceholder: "QuickBooks uses OAuth",
    helperCopy: "Connect QuickBooks with OAuth so invoices can sync without users pasting secrets. Connected companies are used for direct invoice export and sync tracking.",
  },
  {
    id: "freshbooks",
    name: "FreshBooks",
    tagline: "Send invoices into a lightweight accounting stack",
    desc: "Queue invoice export payloads for FreshBooks with customer, aircraft, line items, totals, memo, and sync status tracking.",
    category: "Accounting",
    logoUrl: "https://logo.clearbit.com/freshbooks.com",
    docsUrl: "https://www.freshbooks.com",
    syncFields: ["Invoice number", "Customer", "Line items", "Totals", "Memo", "Issue date"],
    credentialLabel: "OAuth connection",
    credentialPlaceholder: "FreshBooks uses OAuth",
    helperCopy: "Connect FreshBooks with OAuth so invoices can export directly into the selected business account and stay in sync automatically.",
  },
];

const CATEGORY_PILL: Record<Category, string> = {
  "Flight Scheduling": "bg-blue-50 text-blue-700 border-blue-200",
  "Live Tracking": "bg-orange-50 text-orange-700 border-orange-200",
  "Maintenance & Data": "bg-slate-50 text-slate-700 border-slate-200",
  Accounting: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function timeSince(date: Date): string {
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusLabel(status: string | null): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "partial_success":
      return "Partially synced";
    case "queued_for_export":
      return "Queued for export";
    case "exported_locally":
      return "Prepared";
    case "scaffolded":
      return "Adapter scaffolded";
    case "success":
      return "Synced";
    case "failed":
      return "Sync failed";
    default:
      return status || "Connected";
  }
}

function isOAuthIntegration(id: IntegrationId) {
  return id === "quickbooks" || id === "freshbooks";
}

function statusTone(status: string | null): string {
  if (status === "failed") return "bg-red-50 text-red-700 border-red-200";
  if (status === "partial_success") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "queued_for_export" || status === "exported_locally") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (status === "scaffolded") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function IntegrationLogo({
  integration,
  compact = false,
}: {
  integration: Integration;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = integration.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  if (!integration.logoUrl || failed) {
    return (
      <div
        className={`rounded-xl bg-[#0A1628] text-white flex items-center justify-center ${compact ? "w-10 h-10 text-[10px]" : "w-12 h-12 text-[11px]"}`}
        style={{ fontWeight: 800 }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border bg-white flex items-center justify-center overflow-hidden ${compact ? "w-10 h-10 p-2" : "w-12 h-12 p-2.5"}`}>
      <img
        src={integration.logoUrl}
        alt={`${integration.name} logo`}
        className="max-h-full max-w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function ConnectModal({
  integration,
  onClose,
}: {
  integration: Integration;
  onClose: () => void;
}) {
  const store = useIntegrationStore();
  const [apiKey, setApiKey] = useState("");
  const [accountId, setAccountId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const oauthOnly = isOAuthIntegration(integration.id);

  const credentials = useMemo(
    () => ({
      api_key: apiKey.trim(),
      account_id: accountId.trim() || undefined,
      base_url: baseUrl.trim() || undefined,
    }),
    [accountId, apiKey, baseUrl]
  );

  async function handleTest() {
    if (oauthOnly) return;
    setTesting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const result = await store.testConnection(integration.id, credentials);
      setSuccessMessage(result?.message ?? "Connection verified");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleConnect() {
    if (oauthOnly) {
      setConnecting(true);
      setError(null);
      try {
        store.beginOAuth(integration.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "OAuth redirect failed");
        setConnecting(false);
      }
      return;
    }

    setConnecting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await store.connect(integration.id, credentials, {
        docs_url: integration.docsUrl,
        sync_fields: integration.syncFields,
      });
      setSuccessMessage(`${integration.name} connected successfully`);
      setTimeout(onClose, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
      >
        <div className="flex items-start gap-3 border-b border-border px-6 py-5">
          <IntegrationLogo integration={integration} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
              Connect {integration.name}
            </div>
            <div className="text-[12px] text-muted-foreground mt-1">
              {integration.tagline}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {oauthOnly ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5 text-[12px] text-blue-900">
              <div className="font-semibold mb-1">Secure OAuth connection</div>
              <p className="leading-relaxed">
                You will be redirected to {integration.name} to sign in and approve access.
                myaircraft.us will store encrypted refresh/access tokens so invoices can sync automatically without asking users to paste secrets.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-[12px] text-muted-foreground" style={{ fontWeight: 600 }}>
                  {integration.credentialLabel || "API key / access token"} <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={integration.credentialPlaceholder || "Paste your provider credentials"}
                  className="w-full rounded-xl border border-border px-3.5 py-2.5 text-[13px] outline-none focus:border-primary/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[12px] text-muted-foreground" style={{ fontWeight: 600 }}>
                    Account ID
                  </label>
                  <input
                    type="text"
                    value={accountId}
                    onChange={(event) => setAccountId(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-border px-3.5 py-2.5 text-[13px] outline-none focus:border-primary/40"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] text-muted-foreground" style={{ fontWeight: 600 }}>
                    Base URL
                  </label>
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-border px-3.5 py-2.5 text-[13px] outline-none focus:border-primary/40"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <div className="mb-2 text-[12px] text-muted-foreground" style={{ fontWeight: 600 }}>
              What this integration handles
            </div>
            <div className="flex flex-wrap gap-1.5">
              {integration.syncFields.map((field) => (
                <span
                  key={field}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground"
                  style={{ fontWeight: 500 }}
                >
                  {field}
                </span>
              ))}
            </div>
          </div>

          {integration.helperCopy && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-[12px] text-blue-800">
              {integration.helperCopy}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] text-red-700">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[12px] text-emerald-700">
              {successMessage}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            {!oauthOnly && (
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={!apiKey.trim() || testing}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-[13px] text-foreground disabled:opacity-50"
                style={{ fontWeight: 600 }}
              >
                {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {testing ? "Testing…" : "Test connection"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={oauthOnly ? connecting : !apiKey.trim() || connecting}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-[13px] text-white disabled:opacity-50"
              style={{ fontWeight: 600 }}
            >
              {connecting ? (oauthOnly ? "Redirecting…" : "Connecting…") : oauthOnly ? `Continue to ${integration.name}` : "Connect"}
            </button>
          </div>

          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-primary"
              style={{ fontWeight: 600 }}
            >
              Provider docs <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function InfoModal({
  integration,
  onClose,
  onOpenConnect,
}: {
  integration: Integration;
  onClose: () => void;
  onOpenConnect: () => void;
}) {
  const store = useIntegrationStore();
  const connected = store.isConnected(integration.id);
  const lastSync = store.getLastSync(integration.id);
  const lastError = store.getLastError(integration.id);
  const lastStatus = store.getLastSyncStatus(integration.id);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    setActionError(null);
    try {
      const payload = await store.triggerSync(integration.id);
      const summaryText =
        payload?.summary?.message ||
        payload?.summary?.adapter_status ||
        `${payload?.records_synced ?? 0} record(s) processed`;
      setSyncMessage(summaryText);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setActionError(null);
    try {
      await store.disconnect(integration.id);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Disconnect failed");
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
      >
        <div className="border-b border-border px-6 py-5">
          <div className="flex items-start gap-3">
            <IntegrationLogo integration={integration} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
                  {integration.name}
                </div>
                {integration.featured && (
                  <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] text-primary" style={{ fontWeight: 700 }}>
                    Featured
                  </span>
                )}
              </div>
              <div className="text-[12px] text-muted-foreground mt-1">
                {integration.tagline}
              </div>
              <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${CATEGORY_PILL[integration.category]}`} style={{ fontWeight: 700 }}>
                {integration.category}
              </span>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-[13px] leading-relaxed text-muted-foreground">{integration.desc}</p>

          <div className="flex flex-wrap gap-1.5">
            {integration.syncFields.map((field) => (
              <span
                key={field}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground"
                style={{ fontWeight: 500 }}
              >
                {field}
              </span>
            ))}
          </div>

          {connected ? (
            <div className={`rounded-xl border px-3.5 py-3 ${statusTone(lastStatus)}`}>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <div className="text-[12px]" style={{ fontWeight: 700 }}>
                  {statusLabel(lastStatus)}
                </div>
              </div>
              <div className="mt-1 text-[12px]">
                {lastSync ? `Last sync ${timeSince(lastSync)}` : "Connected and ready to sync"}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-3 text-[12px] text-muted-foreground">
              This integration is not connected yet.
            </div>
          )}

          {lastError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] text-red-700">
              {lastError}
            </div>
          )}
          {actionError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12px] text-red-700">
              {actionError}
            </div>
          )}
          {syncMessage && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-[12px] text-blue-700">
              {syncMessage}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            {connected ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleSync()}
                  disabled={syncing}
                  className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-[13px] text-white disabled:opacity-50"
                  style={{ fontWeight: 600 }}
                >
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-[13px] text-muted-foreground"
                  style={{ fontWeight: 600 }}
                >
                  <Unplug className="w-4 h-4" />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenConnect}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-[13px] text-white"
                style={{ fontWeight: 600 }}
              >
                Connect
              </button>
            )}
          </div>

          {integration.docsUrl && (
            <a
              href={integration.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-primary"
              style={{ fontWeight: 600 }}
            >
              Provider docs <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function IntegrationTile({
  integration,
  onOpenInfo,
  onOpenConnect,
}: {
  integration: Integration;
  onOpenInfo: () => void;
  onOpenConnect: () => void;
}) {
  const store = useIntegrationStore();
  const connected = store.isConnected(integration.id);
  const lastStatus = store.getLastSyncStatus(integration.id);
  const lastSync = store.getLastSync(integration.id);
  const lastError = store.getLastError(integration.id);

  return (
    <div
      className={`group rounded-2xl border bg-white p-4 transition-all ${
        connected ? "border-emerald-200 shadow-sm" : "border-border hover:border-primary/25 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <IntegrationLogo integration={integration} compact />
          <div className="min-w-0">
            <div className="truncate text-[13px] text-foreground" style={{ fontWeight: 700 }}>
              {integration.name}
            </div>
            <div className="line-clamp-2 text-[11px] text-muted-foreground">
              {integration.tagline}
            </div>
          </div>
        </div>
        {integration.featured && (
          <span className="rounded-full bg-primary/5 px-2 py-0.5 text-[10px] text-primary" style={{ fontWeight: 700 }}>
            Popular
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${CATEGORY_PILL[integration.category]}`} style={{ fontWeight: 700 }}>
          {integration.category}
        </span>
        {connected ? (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(lastStatus)}`} style={{ fontWeight: 700 }}>
            {statusLabel(lastStatus)}
          </span>
        ) : (
          <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground" style={{ fontWeight: 700 }}>
            Not connected
          </span>
        )}
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground">
        {lastError
          ? lastError
          : connected && lastSync
          ? `Last sync ${timeSince(lastSync)}`
          : integration.desc}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenInfo}
          className="flex-1 rounded-xl border border-border px-3 py-2 text-[12px] text-foreground"
          style={{ fontWeight: 600 }}
        >
          Details
        </button>
        {!connected && (
          <button
            type="button"
            onClick={onOpenConnect}
            className="rounded-xl bg-primary px-3 py-2 text-[12px] text-white"
            style={{ fontWeight: 600 }}
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

export function IntegrationsPage() {
  const store = useIntegrationStore();
  const searchParams = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<"All" | Category>("All");
  const [connectTarget, setConnectTarget] = useState<Integration | null>(null);
  const [infoTarget, setInfoTarget] = useState<Integration | null>(null);

  const categories = ["All", "Flight Scheduling", "Live Tracking", "Maintenance & Data", "Accounting"] as const;

  const connectedItems = INTEGRATIONS.filter((integration) => store.isConnected(integration.id));

  const filteredItems = useMemo(() => {
    if (activeCategory === "All") return INTEGRATIONS;
    return INTEGRATIONS.filter((integration) => integration.category === activeCategory);
  }, [activeCategory]);

  const connectedCount = connectedItems.length;
  const syncingCount = connectedItems.filter((integration) => {
    const status = store.getLastSyncStatus(integration.id);
    return status === "queued_for_export" || status === "scaffolded";
  }).length;
  const failedCount = connectedItems.filter((integration) => store.getLastSyncStatus(integration.id) === "failed").length;
  const callbackProvider = searchParams.get("provider");
  const callbackStatus = searchParams.get("integration_status");
  const callbackReason = searchParams.get("reason");

  return (
    <div className="space-y-4">
      {callbackStatus === "connected" && callbackProvider && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">
          {callbackProvider === "quickbooks" ? "QuickBooks" : callbackProvider === "freshbooks" ? "FreshBooks" : "Accounting"} connected successfully. OAuth is complete and invoice sync is ready.
        </div>
      )}

      {callbackStatus === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-700">
          Integration connection failed{callbackReason ? `: ${decodeURIComponent(callbackReason)}` : "."}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>
              Integrations
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Connect scheduling, tracking, maintenance, and accounting systems. Live providers use real status. Scaffolded adapters stay honest about what is ready versus what still needs provider OAuth or API access.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 shrink-0">
            {[
              { label: "Connected", value: connectedCount, tone: "text-primary" },
              { label: "Pending sync", value: syncingCount, tone: "text-amber-600" },
              { label: "Needs attention", value: failedCount, tone: "text-red-600" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-center min-w-[102px]">
                <div className={`text-[22px] ${item.tone}`} style={{ fontWeight: 800 }}>
                  {item.value}
                </div>
                <div className="text-[11px] text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
        <p className="text-[12px] text-blue-800">
          API-key integrations are validated before they are saved. QuickBooks and FreshBooks now use OAuth-style connection flow, and maintenance adapters still expose honest scaffold status instead of pretending remote sync exists where it does not yet.
        </p>
      </div>

      {connectedItems.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 mb-2" style={{ fontWeight: 700 }}>
            Active connections
          </div>
          <div className="flex flex-wrap gap-2">
            {connectedItems.map((integration) => {
              const lastStatus = store.getLastSyncStatus(integration.id);
              const lastSync = store.getLastSync(integration.id);
              return (
                <button
                  key={integration.id}
                  type="button"
                  onClick={() => setInfoTarget(integration)}
                  className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-left"
                >
                  <IntegrationLogo integration={integration} compact />
                  <div>
                    <div className="text-[11px] text-emerald-900" style={{ fontWeight: 700 }}>
                      {integration.name}
                    </div>
                    <div className="text-[10px] text-emerald-700">
                      {lastSync ? `${statusLabel(lastStatus)} · ${timeSince(lastSync)}` : statusLabel(lastStatus)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {categories.map((category) => {
          const count =
            category === "All"
              ? INTEGRATIONS.length
              : INTEGRATIONS.filter((integration) => integration.category === category).length;
          const active = activeCategory === category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`rounded-xl px-3.5 py-2 text-[12px] transition-colors ${
                active ? "bg-primary text-white" : "border border-border bg-white text-muted-foreground hover:text-foreground"
              }`}
              style={{ fontWeight: 600 }}
            >
              {category} <span className={active ? "text-white/80" : "text-muted-foreground"}>({count})</span>
            </button>
          );
        })}
      </div>

      {store.isLoading() && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-3 text-[12px] text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Refreshing integration status…
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((integration) => (
          <IntegrationTile
            key={integration.id}
            integration={integration}
            onOpenInfo={() => setInfoTarget(integration)}
            onOpenConnect={() => setConnectTarget(integration)}
          />
        ))}
      </div>

      <AnimatePresence>
        {connectTarget && (
          <ConnectModal
            integration={connectTarget}
            onClose={() => setConnectTarget(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {infoTarget && (
          <InfoModal
            integration={infoTarget}
            onClose={() => setInfoTarget(null)}
            onOpenConnect={() => {
              setInfoTarget(null);
              setConnectTarget(infoTarget);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
