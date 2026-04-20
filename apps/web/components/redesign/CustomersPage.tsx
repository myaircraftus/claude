"use client";

import { useEffect, useState } from "react";
import {
  Users, Plus, Search, Mail, Phone, Plane, MoreHorizontal,
  DollarSign, FileText, Wrench, Clock, Tag, ChevronRight,
  AlertTriangle, CheckCircle, Building2, Star, Receipt,
  BookOpen, ExternalLink, Edit3, X, Check, UserPlus
} from "lucide-react";
import { useDataStore, type Customer } from "./workspace/DataStore";
import Link from "@/components/shared/tenant-link";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

/* ─── Recent activity (real data not yet wired) ────────────────── */
const CUSTOMER_ACTIVITY: Record<string, { icon: any; text: string; time: string; type: string }[]> = {};

/* ─── Add Customer form state ─────────────────────────────────── */
interface AddCustomerForm {
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  aircraft: string;
  preferredContact: "Email" | "Phone" | "Text";
  notes: string;
}

const EMPTY_FORM: AddCustomerForm = {
  name: "", company: "", email: "", phone: "",
  address: "", aircraft: "", preferredContact: "Email", notes: "",
};

/* ─── Tag colors ──────────────────────────────────────────────── */
const TAG_COLORS: Record<string, string> = {
  "Owner-Operator": "bg-blue-50 text-blue-700",
  "Part 91": "bg-slate-100 text-slate-600",
  "Part 135": "bg-violet-50 text-violet-700",
  "Regular Customer": "bg-emerald-50 text-emerald-700",
  "Charter": "bg-indigo-50 text-indigo-700",
  "Commercial": "bg-amber-50 text-amber-700",
  "VIP": "bg-yellow-50 text-yellow-700",
};

function getTagColor(tag: string) {
  return TAG_COLORS[tag] || "bg-muted text-muted-foreground";
}

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

function getAvatarBg(name: string) {
  const colors = [
    "bg-blue-600", "bg-violet-600", "bg-emerald-600",
    "bg-amber-600", "bg-rose-600", "bg-indigo-600",
  ];
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

/* ════════════════════════════════════════════════════════════════ */
export function CustomersPage() {
  const { customers, addCustomer } = useDataStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<AddCustomerForm>(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState<"overview" | "activity" | "aircraft">("overview");

  const allCustomers: Customer[] = customers;

  const filtered = allCustomers.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.aircraft.some(a => a.toLowerCase().includes(q))
    );
  });

  const selected = allCustomers.find(c => c.id === selectedId) ?? allCustomers[0] ?? null;

  useEffect(() => {
    if (!selectedId && allCustomers.length > 0) {
      setSelectedId(allCustomers[0].id);
    }
  }, [selectedId, allCustomers.length]);

  const totalOutstanding = allCustomers.reduce((s, c) => s + c.outstandingBalance, 0);
  const totalBilled = allCustomers.reduce((s, c) => s + c.totalBilled, 0);
  const withBalance = allCustomers.filter(c => c.outstandingBalance > 0).length;

  const handleAdd = () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    addCustomer({
      name: form.name.trim(),
      company: form.company.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      aircraft: form.aircraft ? [form.aircraft.toUpperCase().trim()] : [],
      totalWorkOrders: 0,
      openInvoices: 0,
      totalBilled: 0,
      outstandingBalance: 0,
      lastService: "",
      preferredContact: form.preferredContact,
      notes: form.notes.trim(),
      tags: [],
    });
    toast.success(`${form.name} added as a customer.`);
    setForm(EMPTY_FORM);
    setShowAddModal(false);
  };

  return (
    <div className="h-full flex overflow-hidden bg-[#F7F8FA]">

      {/* ── Left list panel ── */}
      <div className="w-[320px] shrink-0 border-r border-border flex flex-col bg-white">

        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-[16px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Customers</h1>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 bg-[#0A1628] text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-[#0A1628]/90 transition-colors"
              style={{ fontWeight: 600 }}
            >
              <UserPlus className="w-3.5 h-3.5" /> Add Customer
            </button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg border border-border px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search customers, aircraft..."
              className="flex-1 bg-transparent text-[12px] outline-none"
            />
          </div>
        </div>

        {/* Stats mini row */}
        <div className="grid grid-cols-3 border-b border-border shrink-0">
          {[
            { l: "Total", v: allCustomers.length, c: "text-foreground" },
            { l: "w/ Balance", v: withBalance, c: "text-amber-600" },
            { l: "Aircraft", v: allCustomers.flatMap(c => c.aircraft).length, c: "text-primary" },
          ].map(s => (
            <div key={s.l} className="px-2 py-2 text-center">
              <div className={`text-[15px] ${s.c}`} style={{ fontWeight: 700 }}>{s.v}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-[13px]">No customers match</p>
            </div>
          ) : (
            filtered.map(customer => {
              const active = customer.id === selectedId;
              const hasBalance = customer.outstandingBalance > 0;
              return (
                <button
                  key={customer.id}
                  onClick={() => { setSelectedId(customer.id); setActiveTab("overview"); }}
                  className={`w-full text-left px-4 py-3.5 border-b border-border hover:bg-muted/20 transition-colors ${active ? "bg-primary/5 border-l-[3px] border-l-primary" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-[12px] shrink-0 ${getAvatarBg(customer.name)}`} style={{ fontWeight: 700 }}>
                      {getInitials(customer.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>{customer.name}</span>
                        {hasBalance && (
                          <span className="text-[11px] text-amber-700 shrink-0 ml-2" style={{ fontWeight: 700 }}>
                            ${customer.outstandingBalance.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">{customer.company || "Individual"}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {customer.aircraft.map(ac => (
                          <span key={ac} className="flex items-center gap-0.5">
                            <Plane className="w-2.5 h-2.5" />{ac}
                          </span>
                        ))}
                        {hasBalance && <span className="text-amber-600 ml-auto" style={{ fontWeight: 600 }}>Balance due</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer stats */}
        <div className="shrink-0 border-t border-border p-3 bg-muted/20">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Total billed</span>
            <span className="text-foreground" style={{ fontWeight: 700 }}>${totalBilled.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-1">
            <span className="text-muted-foreground">Outstanding</span>
            <span className={`${totalOutstanding > 0 ? "text-amber-600" : "text-emerald-600"}`} style={{ fontWeight: 700 }}>
              ${totalOutstanding.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Right detail panel ── */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 max-w-4xl"
            >
              {/* Customer header */}
              <div className="flex items-start gap-5 mb-6">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-[20px] shrink-0 ${getAvatarBg(selected.name)}`} style={{ fontWeight: 700 }}>
                  {getInitials(selected.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h2 className="text-[22px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{selected.name}</h2>
                    {selected.tags.slice(0, 3).map(tag => (
                      <span key={tag} className={`text-[10px] px-2 py-0.5 rounded-full ${getTagColor(tag)}`} style={{ fontWeight: 600 }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  {selected.company && (
                    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mb-1">
                      <Building2 className="w-3.5 h-3.5" /> {selected.company}
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
                    <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                      <Mail className="w-3.5 h-3.5" /> {selected.email}
                    </a>
                    <a href={`tel:${selected.phone}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                      <Phone className="w-3.5 h-3.5" /> {selected.phone}
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toast.info("Email compose coming soon.")}
                    className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
                    style={{ fontWeight: 500 }}
                  >
                    <Mail className="w-3.5 h-3.5" /> Email
                  </button>
                  <button
                    onClick={() => toast.info("Call integration coming soon.")}
                    className="flex items-center gap-1.5 border border-border px-3 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/30 transition-colors"
                    style={{ fontWeight: 500 }}
                  >
                    <Phone className="w-3.5 h-3.5" /> Call
                  </button>
                  <button
                    onClick={() => toast.info("Edit customer details in Settings → Customers.")}
                    className="p-2 border border-border rounded-lg hover:bg-muted/30 text-muted-foreground transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Stats cards */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Work Orders", value: selected.totalWorkOrders, icon: Wrench, color: "text-primary", bg: "bg-primary/5" },
                  { label: "Total Billed", value: `$${selected.totalBilled.toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Open Invoices", value: selected.openInvoices, icon: Receipt, color: "text-blue-600", bg: "bg-blue-50" },
                  {
                    label: "Outstanding",
                    value: selected.outstandingBalance > 0 ? `$${selected.outstandingBalance.toLocaleString()}` : "Clear",
                    icon: AlertTriangle,
                    color: selected.outstandingBalance > 0 ? "text-amber-600" : "text-emerald-600",
                    bg: selected.outstandingBalance > 0 ? "bg-amber-50" : "bg-emerald-50",
                  },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border border-border p-4">
                    <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    <div className="text-[18px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{s.value}</div>
                    <div className="text-[11px] text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Tab row */}
              <div className="flex gap-1 mb-5 border-b border-border">
                {(["overview", "activity", "aircraft"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2.5 text-[12px] border-b-2 transition-colors capitalize ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    style={{ fontWeight: activeTab === tab ? 600 : 400 }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Overview tab */}
              {activeTab === "overview" && (
                <div className="grid lg:grid-cols-2 gap-5">
                  {/* Contact + address */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-[13px] text-foreground mb-4" style={{ fontWeight: 600 }}>Contact Details</h3>
                    <div className="space-y-3 text-[12px]">
                      <div className="flex items-start gap-3">
                        <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Email</div>
                          <a href={`mailto:${selected.email}`} className="text-primary hover:underline">{selected.email}</a>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Phone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Phone</div>
                          <div className="text-foreground">{selected.phone}</div>
                        </div>
                      </div>
                      {selected.address && (
                        <div className="flex items-start gap-3">
                          <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Address</div>
                            <div className="text-foreground">{selected.address}</div>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <Star className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Preferred Contact</div>
                          <div className="text-foreground">{selected.preferredContact}</div>
                        </div>
                      </div>
                      {selected.lastService && (
                        <div className="flex items-start gap-3">
                          <Clock className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <div className="text-muted-foreground text-[10px] uppercase tracking-wider mb-0.5">Last Service</div>
                            <div className="text-foreground">{new Date(selected.lastService).toLocaleDateString()}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes + Tags */}
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-border p-5">
                      <h3 className="text-[13px] text-foreground mb-3" style={{ fontWeight: 600 }}>Notes</h3>
                      {selected.notes ? (
                        <p className="text-[12px] text-muted-foreground leading-relaxed">{selected.notes}</p>
                      ) : (
                        <p className="text-[12px] text-muted-foreground/50 italic">No notes.</p>
                      )}
                    </div>

                    <div className="bg-white rounded-xl border border-border p-5">
                      <h3 className="text-[13px] text-foreground mb-3" style={{ fontWeight: 600 }}>Tags</h3>
                      {selected.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selected.tags.map(tag => (
                            <span key={tag} className={`text-[11px] px-2.5 py-1 rounded-full ${getTagColor(tag)}`} style={{ fontWeight: 600 }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-muted-foreground/50 italic">No tags.</p>
                      )}
                    </div>

                    {/* Quick actions */}
                    <div className="bg-white rounded-xl border border-border p-4">
                      <h3 className="text-[12px] text-foreground mb-3" style={{ fontWeight: 600 }}>Quick Actions</h3>
                      <div className="space-y-2">
                        <Link
                          href="/maintenance"
                          className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors text-[12px] text-foreground"
                          style={{ fontWeight: 500 }}
                        >
                          <span className="flex items-center gap-2"><Wrench className="w-3.5 h-3.5 text-primary" /> New Work Order</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </Link>
                        <Link
                          href="/maintenance"
                          className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors text-[12px] text-foreground"
                          style={{ fontWeight: 500 }}
                        >
                          <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-primary" /> Create Estimate</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </Link>
                        <Link
                          href="/invoices"
                          className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors text-[12px] text-foreground"
                          style={{ fontWeight: 500 }}
                        >
                          <span className="flex items-center gap-2"><Receipt className="w-3.5 h-3.5 text-primary" /> New Invoice</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Activity tab */}
              {activeTab === "activity" && (
                <div className="space-y-3">
                  {(CUSTOMER_ACTIVITY[selected.id] ?? []).length === 0 ? (
                    <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-[13px]">No activity yet</p>
                    </div>
                  ) : (
                    (CUSTOMER_ACTIVITY[selected.id] ?? []).map((act, i) => {
                      const typeColors: Record<string, string> = {
                        workorder: "bg-primary/10 text-primary",
                        invoice: "bg-emerald-50 text-emerald-700",
                        estimate: "bg-blue-50 text-blue-700",
                        logbook: "bg-violet-50 text-violet-700",
                      };
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="bg-white rounded-xl border border-border px-4 py-3 flex items-center gap-4"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeColors[act.type] || "bg-muted"}`}>
                            <act.icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{act.text}</div>
                          </div>
                          <div className="text-[11px] text-muted-foreground shrink-0">{act.time}</div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Aircraft tab */}
              {activeTab === "aircraft" && (
                <div className="space-y-4">
                  {selected.aircraft.length === 0 ? (
                    <div className="bg-white rounded-xl border border-border p-8 text-center text-muted-foreground">
                      <Plane className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-[13px]">No aircraft linked</p>
                    </div>
                  ) : (
                    selected.aircraft.map(ac => (
                      <Link
                        key={ac}
                        href={`/aircraft/${ac}`}
                        className="flex items-center gap-4 bg-white rounded-xl border border-border px-5 py-4 hover:shadow-md hover:shadow-primary/5 transition-all"
                      >
                        <div className="w-12 h-12 rounded-xl bg-primary/8 flex items-center justify-center">
                          <Plane className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>{ac}</div>
                          <div className="text-[12px] text-muted-foreground">View aircraft detail →</div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="no-customer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex items-center justify-center text-muted-foreground"
            >
              <div className="text-center">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-[14px]" style={{ fontWeight: 500 }}>Select a customer</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Add Customer Modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
              {/* Header */}
              <div className="bg-[#0A1628] px-6 py-5 flex items-center justify-between">
                <div>
                  <div className="text-white text-[15px]" style={{ fontWeight: 700 }}>Add Customer</div>
                  <div className="text-white/50 text-[12px]">New customer record</div>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-white/10 rounded-lg">
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>

              {/* Form */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Full Name *</label>
                    <input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="John Mitchell"
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Company</label>
                    <input
                      value={form.company}
                      onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                      placeholder="Mitchell Aviation LLC"
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="john@example.com"
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Phone</label>
                    <input
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="(512) 555-0000"
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Aircraft (N-number)</label>
                    <input
                      value={form.aircraft}
                      onChange={e => setForm(f => ({ ...f, aircraft: e.target.value }))}
                      placeholder="N12345"
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Preferred Contact</label>
                    <select
                      value={form.preferredContact}
                      onChange={e => setForm(f => ({ ...f, preferredContact: e.target.value as any }))}
                      className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none bg-white"
                    >
                      <option value="Email">Email</option>
                      <option value="Phone">Phone</option>
                      <option value="Text">Text</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Address / Base Airport</label>
                  <input
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="KAUS — Austin-Bergstrom Intl, or street address"
                    className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5" style={{ fontWeight: 600 }}>Internal Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Maintenance preferences, billing notes..."
                    rows={3}
                    className="w-full border border-border rounded-lg px-3 py-2 text-[13px] outline-none resize-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex gap-3 justify-end">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 rounded-xl border border-border text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#0A1628] text-white text-[13px] hover:bg-[#0A1628]/90 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  <Check className="w-4 h-4" /> Add Customer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
