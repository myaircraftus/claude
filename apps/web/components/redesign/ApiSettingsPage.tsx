"use client";

import { useState } from "react";
import {
  Key, BookOpen, Copy, Trash2, Plus, Eye, EyeOff, Check,
  X, RefreshCw, ChevronRight, Shield, AlertCircle, ExternalLink,
  Zap, Globe, Lock, Code2, ArrowUpRight, ArrowDownLeft, CheckCircle,
  Clock, Terminal,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

/* ─── Types ───────────────────────────────────────────────────── */
type Scope = "read" | "write" | "admin";
type KeyStatus = "active" | "revoked";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  created: Date;
  lastUsed?: Date;
  status: KeyStatus;
  description?: string;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  status: "active" | "failing" | "disabled";
  created: Date;
  lastDelivery?: Date;
  deliveryCount: number;
}

/* ─── Demo seed data ──────────────────────────────────────────── */
const SEED_KEYS: ApiKey[] = [];
const SEED_WEBHOOKS: WebhookEndpoint[] = [];

const ALL_EVENTS = [
  { id: "squawk.created",        label: "Squawk Created",        desc: "New squawk added to any aircraft" },
  { id: "squawk.updated",        label: "Squawk Updated",        desc: "Squawk status, severity, or notes changed" },
  { id: "work_order.created",    label: "Work Order Created",    desc: "New work order opened" },
  { id: "work_order.updated",    label: "Work Order Updated",    desc: "Work order status or details changed" },
  { id: "work_order.closed",     label: "Work Order Closed",     desc: "Work order finalized and closed" },
  { id: "estimate.created",      label: "Estimate Created",      desc: "New estimate drafted" },
  { id: "estimate.approved",     label: "Estimate Approved",     desc: "Customer approved an estimate" },
  { id: "invoice.created",       label: "Invoice Created",       desc: "New invoice issued" },
  { id: "invoice.paid",          label: "Invoice Paid",          desc: "Invoice marked as paid" },
  { id: "aircraft.updated",      label: "Aircraft Updated",      desc: "Aircraft hours, status, or details changed" },
  { id: "logbook.entry_created", label: "Logbook Entry Created", desc: "New logbook entry drafted or signed" },
  { id: "customer.created",      label: "Customer Created",      desc: "New customer profile added" },
];

const ENDPOINTS = [
  { method: "GET",    path: "/v1/aircraft",                    desc: "List all aircraft" },
  { method: "GET",    path: "/v1/aircraft/{id}",               desc: "Get aircraft details" },
  { method: "PATCH",  path: "/v1/aircraft/{id}",               desc: "Update aircraft hours / status" },
  { method: "GET",    path: "/v1/aircraft/{id}/squawks",       desc: "List squawks for an aircraft" },
  { method: "POST",   path: "/v1/squawks",                     desc: "Create a new squawk" },
  { method: "PATCH",  path: "/v1/squawks/{id}",                desc: "Update squawk" },
  { method: "GET",    path: "/v1/work-orders",                 desc: "List work orders" },
  { method: "GET",    path: "/v1/work-orders/{id}",            desc: "Get work order detail" },
  { method: "POST",   path: "/v1/work-orders",                 desc: "Create a work order" },
  { method: "PATCH",  path: "/v1/work-orders/{id}",            desc: "Update work order" },
  { method: "GET",    path: "/v1/estimates",                   desc: "List estimates" },
  { method: "POST",   path: "/v1/estimates",                   desc: "Create an estimate" },
  { method: "GET",    path: "/v1/invoices",                    desc: "List invoices" },
  { method: "POST",   path: "/v1/invoices",                    desc: "Create an invoice" },
  { method: "GET",    path: "/v1/logbook",                     desc: "List logbook entries" },
  { method: "POST",   path: "/v1/logbook",                     desc: "Create a logbook entry" },
  { method: "GET",    path: "/v1/customers",                   desc: "List customers" },
  { method: "POST",   path: "/v1/customers",                   desc: "Create a customer" },
  { method: "GET",    path: "/v1/webhooks",                    desc: "List webhook endpoints" },
  { method: "POST",   path: "/v1/webhooks",                    desc: "Register a webhook endpoint" },
  { method: "DELETE", path: "/v1/webhooks/{id}",               desc: "Delete a webhook endpoint" },
];

/* ─── Helpers ─────────────────────────────────────────────────── */
function timeSince(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  return `${day}d ago`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const METHOD_COLOR: Record<string, string> = {
  GET:    "bg-blue-50 text-blue-700 border-blue-200",
  POST:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  PATCH:  "bg-amber-50 text-amber-700 border-amber-200",
  DELETE: "bg-red-50 text-red-700 border-red-200",
};

const SCOPE_COLOR: Record<Scope, string> = {
  read:  "bg-blue-50 text-blue-700 border-blue-200",
  write: "bg-violet-50 text-violet-700 border-violet-200",
  admin: "bg-red-50 text-red-700 border-red-200",
};

/* ─── Create API Key Modal ────────────────────────────────────── */
function CreateKeyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (k: ApiKey) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [scopes, setScopes] = useState<Set<Scope>>(new Set(["read"]));
  const [created, setCreated] = useState<{ key: ApiKey; fullKey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleScope(s: Scope) {
    setScopes((prev) => {
      const n = new Set(prev);
      if (n.has(s)) { if (n.size > 1) n.delete(s); } else n.add(s);
      return n;
    });
  }

  function handleCreate() {
    const rand = Math.random().toString(36).slice(2, 10);
    const fullKey = `ma_live_${rand}${Math.random().toString(36).slice(2, 18)}`;
    const key: ApiKey = {
      id: `key-${Date.now()}`,
      name,
      prefix: `ma_live_${rand}`,
      scopes: Array.from(scopes),
      created: new Date(),
      status: "active",
      description: desc || undefined,
    };
    setCreated({ key, fullKey });
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={created ? undefined : onClose} />
      <motion.div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Key className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>
              {created ? "API Key Created" : "Create API Key"}
            </div>
          </div>
          {!created && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {created ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 space-y-4">
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[12px] text-amber-700 leading-relaxed">
                  <span style={{ fontWeight: 700 }}>Copy this key now.</span> For security, it will never be shown again after you close this dialog.
                </p>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Your new API key</div>
                <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-2.5">
                  <code className="flex-1 text-[12px] text-foreground font-mono break-all">{created.fullKey}</code>
                  <button
                    onClick={() => handleCopy(created.fullKey)}
                    className={`shrink-0 flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors ${
                      copied ? "bg-emerald-100 text-emerald-700" : "bg-white border border-border text-muted-foreground hover:text-primary"
                    }`}
                    style={{ fontWeight: 500 }}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <div className="flex gap-1.5">
                  {Array.from(created.key.scopes).map((s) => (
                    <span key={s} className={`px-2 py-0.5 rounded-full border text-[10px] ${SCOPE_COLOR[s]}`} style={{ fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
                <span>·</span>
                <span>{created.key.name}</span>
              </div>
              <button
                onClick={() => { onCreated(created.key); onClose(); }}
                className="w-full bg-primary text-white px-4 py-2.5 rounded-lg text-[13px] hover:bg-primary/90 transition-colors"
                style={{ fontWeight: 600 }}
              >
                Done — I've saved the key
              </button>
            </motion.div>
          ) : (
            <motion.div key="form" className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                  Key Name <span className="text-red-500">*</span>
                </label>
                <input
                  placeholder="e.g. Production Integration, Dev Testing"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>Description</label>
                <input
                  placeholder="Optional — what is this key used for?"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="block text-[12px] text-muted-foreground mb-2" style={{ fontWeight: 600 }}>Permissions / Scopes</label>
                <div className="space-y-2">
                  {([
                    { s: "read" as Scope, label: "Read", desc: "GET requests only — list and retrieve data" },
                    { s: "write" as Scope, label: "Write", desc: "Create, update, and delete records" },
                    { s: "admin" as Scope, label: "Admin", desc: "Full access including API key management and billing" },
                  ]).map(({ s, label, desc: d }) => (
                    <label key={s} className="flex items-start gap-2.5 cursor-pointer group">
                      <div
                        onClick={() => toggleScope(s)}
                        className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          scopes.has(s) ? "bg-primary border-primary" : "border-border group-hover:border-primary/40"
                        }`}
                      >
                        {scopes.has(s) && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div>
                        <div className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{label}</div>
                        <div className="text-[11px] text-muted-foreground">{d}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreate}
                disabled={!name.trim()}
                className="w-full bg-primary text-white px-4 py-2.5 rounded-lg text-[13px] hover:bg-primary/90 transition-colors disabled:opacity-50"
                style={{ fontWeight: 600 }}
              >
                Generate Key
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/* ─── Add Webhook Modal ───────────────────────────────────────── */
function AddWebhookModal({ onClose, onAdded }: { onClose: () => void; onAdded: (w: WebhookEndpoint) => void }) {
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set(["invoice.paid", "work_order.closed"]));
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);

  function toggleEvent(id: string) {
    setSelectedEvents((prev) => {
      const n = new Set(prev);
      if (n.has(id)) { if (n.size > 1) n.delete(id); } else n.add(id);
      return n;
    });
  }

  function handleTest() {
    if (!url.trim()) return;
    setTesting(true);
    setTimeout(() => { setTesting(false); setTested(true); }, 1800);
  }

  function handleAdd() {
    const wh: WebhookEndpoint = {
      id: `wh-${Date.now()}`,
      url,
      events: Array.from(selectedEvents),
      status: "active",
      created: new Date(),
      deliveryCount: 0,
    };
    onAdded(wh);
    onClose();
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Zap className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1">
            <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>Add Webhook Endpoint</div>
            <div className="text-[11px] text-muted-foreground">Push events from myaircraft.us to your system in real time</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
              Endpoint URL <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://your-app.com/api/webhooks/myaircraft"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setTested(false); }}
                className="flex-1 border border-border rounded-lg px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={handleTest}
                disabled={!url.trim() || testing}
                className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors disabled:opacity-50 shrink-0"
                style={{ fontWeight: 500 }}
              >
                {testing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : tested ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <Zap className="w-3.5 h-3.5" />}
                {testing ? "Testing…" : tested ? "Reachable" : "Test"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Must be HTTPS. We'll send a POST with a JSON payload and an <code className="font-mono bg-muted px-1 rounded">X-MyAircraft-Signature</code> header.</p>
          </div>

          <div>
            <label className="block text-[12px] text-muted-foreground mb-2" style={{ fontWeight: 600 }}>
              Events to Subscribe ({selectedEvents.size} selected)
            </label>
            <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-y-auto pr-1">
              {ALL_EVENTS.map((ev) => (
                <label key={ev.id} className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-muted/30 transition-colors">
                  <div
                    onClick={() => toggleEvent(ev.id)}
                    className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      selectedEvents.has(ev.id) ? "bg-primary border-primary" : "border-border"
                    }`}
                  >
                    {selectedEvents.has(ev.id) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div>
                    <div className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{ev.label}</div>
                    <div className="text-[10px] text-muted-foreground">{ev.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={!url.trim() || selectedEvents.size === 0}
            className="w-full bg-primary text-white px-4 py-2.5 rounded-lg text-[13px] hover:bg-primary/90 transition-colors disabled:opacity-50"
            style={{ fontWeight: 600 }}
          >
            Add Endpoint
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                       */
/* ═══════════════════════════════════════════════════════════════ */
export function ApiSettingsPage() {
  const [activeTab, setActiveTab] = useState<"keys" | "webhooks" | "reference">("keys");
  const [keys, setKeys] = useState<ApiKey[]>(SEED_KEYS);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>(SEED_WEBHOOKS);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const TABS = [
    { id: "keys" as const,      icon: Key,      label: "API Keys" },
    { id: "webhooks" as const,  icon: Zap,      label: "Webhooks" },
    { id: "reference" as const, icon: BookOpen, label: "API Reference" },
  ];

  function handleCopy(id: string, text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleRevoke(id: string) {
    setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: "revoked" } : k));
  }

  function handleDeleteWebhook(id: string) {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>API & Developer</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Manage API keys for inbound access, configure outbound webhooks, and explore the full REST API reference.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
              <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
              <span className="text-[11px] text-emerald-700" style={{ fontWeight: 600 }}>Inbound</span>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
              <ArrowUpRight className="w-3 h-3 text-blue-600" />
              <span className="text-[11px] text-blue-700" style={{ fontWeight: 600 }}>Outbound</span>
            </div>
          </div>
        </div>

        {/* Base URL */}
        <div className="mt-3 flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 border border-border">
          <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <code className="text-[12px] text-foreground font-mono flex-1">https://api.myaircraft.us/v1</code>
          <button
            onClick={() => handleCopy("baseurl", "https://api.myaircraft.us/v1")}
            className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            {copiedId === "baseurl" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] transition-colors ${
              activeTab === t.id
                ? "bg-primary text-white"
                : "bg-white border border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
            style={{ fontWeight: 500 }}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.id === "keys" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === t.id ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`} style={{ fontWeight: 700 }}>
                {keys.filter(k => k.status === "active").length}
              </span>
            )}
            {t.id === "webhooks" && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === t.id ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`} style={{ fontWeight: 700 }}>
                {webhooks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── API Keys Tab ─────────────────────────────────────────── */}
      {activeTab === "keys" && (
        <div className="space-y-3">
          {/* Notice */}
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5">
            <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 leading-relaxed">
              <span style={{ fontWeight: 700 }}>Treat API keys like passwords.</span>{" "}
              Never commit them to source control or expose them in client-side code. Keys are shown once at creation and cannot be retrieved again.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>API Keys</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {keys.filter(k => k.status === "active").length} active · Bearer token authentication
                </div>
              </div>
              <button
                onClick={() => setShowCreateKey(true)}
                className="flex items-center gap-1.5 bg-primary text-white px-3.5 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors"
                style={{ fontWeight: 600 }}
              >
                <Plus className="w-3.5 h-3.5" /> Create Key
              </button>
            </div>

            {/* Auth example */}
            <div className="px-5 py-3 bg-muted/20 border-b border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Authentication</div>
              <div className="flex items-center gap-2 bg-[#0d1117] rounded-lg px-3 py-2">
                <code className="text-[11px] text-emerald-400 font-mono">
                  Authorization: Bearer <span className="text-slate-400">{"{"}</span>your_api_key<span className="text-slate-400">{"}"}</span>
                </code>
                <button
                  onClick={() => handleCopy("auth", "Authorization: Bearer {your_api_key}")}
                  className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {copiedId === "auth" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {/* Keys list */}
            <div className="divide-y divide-border">
              {keys.map((k) => (
                <div key={k.id} className={`p-5 flex items-start gap-4 ${k.status === "revoked" ? "opacity-50" : ""}`}>
                  <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${k.status === "revoked" ? "bg-muted" : "bg-primary/8"}`}>
                    <Key className={`w-4 h-4 ${k.status === "revoked" ? "text-muted-foreground" : "text-primary"}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{k.name}</span>
                      {k.status === "revoked" && (
                        <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Revoked</span>
                      )}
                      {k.status === "active" && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Active</span>
                      )}
                      <div className="flex gap-1">
                        {k.scopes.map((s) => (
                          <span key={s} className={`text-[9px] px-1.5 py-0.5 rounded-full border ${SCOPE_COLOR[s]}`} style={{ fontWeight: 700 }}>{s}</span>
                        ))}
                      </div>
                    </div>

                    {k.description && (
                      <div className="text-[11px] text-muted-foreground mb-1.5">{k.description}</div>
                    )}

                    <div className="flex items-center gap-2 bg-muted/30 border border-border rounded-lg px-3 py-1.5 w-fit">
                      <code className="text-[12px] font-mono text-foreground">
                        {revealedKeyId === k.id ? `${k.prefix}••••••••••••` : `${k.prefix}••••`}
                      </code>
                      <button
                        onClick={() => setRevealedKeyId(revealedKeyId === k.id ? null : k.id)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Toggle visibility"
                      >
                        {revealedKeyId === k.id ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => handleCopy(k.id, k.prefix + "••••••••••••••••")}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Copy prefix"
                      >
                        {copiedId === k.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created {formatDate(k.created)}</span>
                      {k.lastUsed && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Last used {timeSince(k.lastUsed)}</span>}
                    </div>
                  </div>

                  {k.status === "active" && (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      className="shrink-0 text-[11px] border border-border px-3 py-1.5 rounded-lg text-muted-foreground hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Webhooks Tab ─────────────────────────────────────────── */}
      {activeTab === "webhooks" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5">
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 leading-relaxed">
              <span style={{ fontWeight: 700 }}>Outbound webhooks push events to your systems in real time.</span>{" "}
              We sign every request with an HMAC-SHA256 signature using your webhook secret. Retries are automatic on failure (3×, exponential backoff).
            </p>
          </div>

          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>Webhook Endpoints</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {webhooks.filter(w => w.status === "active").length} active · {webhooks.reduce((s, w) => s + w.deliveryCount, 0).toLocaleString()} total deliveries
                </div>
              </div>
              <button
                onClick={() => setShowAddWebhook(true)}
                className="flex items-center gap-1.5 bg-primary text-white px-3.5 py-2 rounded-lg text-[12px] hover:bg-primary/90 transition-colors"
                style={{ fontWeight: 600 }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Endpoint
              </button>
            </div>

            <div className="divide-y divide-border">
              {webhooks.map((w) => (
                <div key={w.id} className="p-5 flex items-start gap-4">
                  <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center ${
                    w.status === "active" ? "bg-violet-100" : w.status === "failing" ? "bg-red-100" : "bg-muted"
                  }`}>
                    <Zap className={`w-4 h-4 ${
                      w.status === "active" ? "text-violet-600" : w.status === "failing" ? "text-red-500" : "text-muted-foreground"
                    }`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <code className="text-[12px] text-foreground font-mono truncate max-w-xs">{w.url}</code>
                      {w.status === "active" && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-1" style={{ fontWeight: 600 }}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                        </span>
                      )}
                      {w.status === "failing" && (
                        <span className="text-[10px] bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>Failing</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {w.events.map((ev) => (
                        <span key={ev} className="text-[10px] bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-mono" style={{ fontWeight: 500 }}>{ev}</span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created {formatDate(w.created)}</span>
                      {w.lastDelivery && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Last delivery {timeSince(w.lastDelivery)}</span>}
                      <span style={{ fontWeight: 600 }}>{w.deliveryCount.toLocaleString()} deliveries</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      className="text-[11px] border border-border px-3 py-1.5 rounded-lg text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                      style={{ fontWeight: 500 }}
                    >
                      Test
                    </button>
                    <button
                      onClick={() => handleDeleteWebhook(w.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {webhooks.length === 0 && (
                <div className="p-10 text-center">
                  <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-[13px] text-muted-foreground">No webhook endpoints yet.</p>
                  <button
                    onClick={() => setShowAddWebhook(true)}
                    className="mt-3 text-[13px] text-primary" style={{ fontWeight: 500 }}
                  >
                    Add your first endpoint
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Webhook payload example */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <Terminal className="w-4 h-4 text-muted-foreground" />
              <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Example Payload</span>
              <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-mono ml-1">invoice.paid</span>
            </div>
            <div className="bg-[#0d1117] px-5 py-4">
              <pre className="text-[11px] text-slate-300 font-mono leading-relaxed overflow-x-auto">{`{
  "id": "evt_01HX2J4K9QMNR",
  "type": "invoice.paid",
  "created": "2026-04-11T14:32:00Z",
  "data": {
    "invoice": {
      "id": "inv_01HX2J4K",
      "number": "INV-2026-0031",
      "amount_total": 494.50,
      "currency": "usd",
      "status": "paid",
      "aircraft": "N12345",
      "customer": { "id": "cust_01HX", "name": "John Mitchell" },
      "paid_at": "2026-04-11T14:32:00Z"
    }
  }
}`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ── API Reference Tab ─────────────────────────────────────── */}
      {activeTab === "reference" && (
        <div className="space-y-3">
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Base URL", value: "api.myaircraft.us/v1", icon: Globe },
              { label: "Auth Method", value: "Bearer Token", icon: Shield },
              { label: "Rate Limit", value: "1,000 req / hr", icon: RefreshCw },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                  <stat.icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>{stat.label}</div>
                  <div className="text-[13px] text-foreground font-mono" style={{ fontWeight: 600 }}>{stat.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Endpoints table */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>Endpoints</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">REST API — JSON request and response bodies</div>
              </div>
              <a
                href="#"
                className="flex items-center gap-1.5 text-[12px] text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
                style={{ fontWeight: 500 }}
              >
                Full Docs <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="divide-y divide-border">
              {ENDPOINTS.map((ep, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors group">
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-mono shrink-0 w-14 text-center ${METHOD_COLOR[ep.method]}`} style={{ fontWeight: 700 }}>
                    {ep.method}
                  </span>
                  <code className="text-[12px] text-foreground font-mono flex-1">{ep.path}</code>
                  <span className="text-[11px] text-muted-foreground">{ep.desc}</span>
                  <button
                    onClick={() => handleCopy(`ep-${i}`, ep.path)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                  >
                    {copiedId === `ep-${i}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Error codes */}
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <div className="text-[13px] text-foreground" style={{ fontWeight: 700 }}>Response Codes</div>
            </div>
            <div className="divide-y divide-border">
              {[
                { code: "200", label: "OK", desc: "Request succeeded", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                { code: "201", label: "Created", desc: "Resource created successfully", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                { code: "400", label: "Bad Request", desc: "Invalid or missing parameters", color: "text-amber-600 bg-amber-50 border-amber-200" },
                { code: "401", label: "Unauthorized", desc: "Missing or invalid API key", color: "text-red-600 bg-red-50 border-red-200" },
                { code: "403", label: "Forbidden", desc: "Insufficient scope for this action", color: "text-red-600 bg-red-50 border-red-200" },
                { code: "404", label: "Not Found", desc: "Resource does not exist", color: "text-slate-600 bg-slate-50 border-slate-200" },
                { code: "429", label: "Too Many Requests", desc: "Rate limit exceeded — retry after 60s", color: "text-violet-600 bg-violet-50 border-violet-200" },
                { code: "500", label: "Server Error", desc: "Internal error — contact support", color: "text-red-600 bg-red-50 border-red-200" },
              ].map((r) => (
                <div key={r.code} className="flex items-center gap-4 px-5 py-3">
                  <span className={`text-[11px] px-2 py-0.5 rounded border font-mono shrink-0 w-12 text-center ${r.color}`} style={{ fontWeight: 700 }}>{r.code}</span>
                  <span className="text-[12px] text-foreground w-28 shrink-0" style={{ fontWeight: 600 }}>{r.label}</span>
                  <span className="text-[11px] text-muted-foreground">{r.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* SDKs / Resources */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Code2, label: "OpenAPI Spec", desc: "Download the full OpenAPI 3.1 schema", action: "Download JSON" },
              { icon: BookOpen, label: "Full Documentation", desc: "Interactive API docs with live examples", action: "Open Docs" },
            ].map((r) => (
              <div key={r.label} className="bg-white rounded-xl border border-border p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
                  <r.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{r.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</div>
                  <a href="#" className="flex items-center gap-1 text-[11px] text-primary mt-2" style={{ fontWeight: 500 }}>
                    {r.action} <ChevronRight className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Key Modal */}
      <AnimatePresence>
        {showCreateKey && (
          <CreateKeyModal
            onClose={() => setShowCreateKey(false)}
            onCreated={(k) => setKeys((prev) => [k, ...prev])}
          />
        )}
      </AnimatePresence>

      {/* Add Webhook Modal */}
      <AnimatePresence>
        {showAddWebhook && (
          <AddWebhookModal
            onClose={() => setShowAddWebhook(false)}
            onAdded={(w: WebhookEndpoint) => setWebhooks((prev) => [w, ...prev])}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
