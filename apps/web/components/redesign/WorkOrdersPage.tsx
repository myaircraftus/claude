"use client";

import { useState } from "react";
import {
  FileText, Plus, Search, Filter, Download, Printer, Eye, Trash2,
  Clock, CheckCircle, Package, Plane,
  Wrench, ExternalLink
} from "lucide-react";
import { useDataStore, type WorkOrder } from "./workspace/DataStore";
import { motion, AnimatePresence } from "motion/react";
import { CreateWorkOrderModal } from "./CreateWorkOrderModal";
import { toast } from "sonner";
import Link from "@/components/shared/tenant-link";

/* ─── Seed work orders disabled — live data only ───────────────── */

export function WorkOrdersPage() {
  const { workOrders, deleteWorkOrder } = useDataStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const allWOs: WorkOrder[] = workOrders;

  const filteredOrders = allWOs.filter((wo) => {
    const matchesSearch =
      wo.woNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.aircraft.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wo.squawk.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || wo.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-600",
    Open: "bg-blue-50 text-blue-700",
    "In Progress": "bg-indigo-50 text-indigo-700",
    "Awaiting Parts": "bg-amber-50 text-amber-700",
    "Awaiting Approval": "bg-orange-50 text-orange-700",
    "Waiting Customer": "bg-yellow-50 text-yellow-700",
    "Ready for Signoff": "bg-emerald-50 text-emerald-700",
    Closed: "bg-slate-100 text-slate-600",
    "Invoice Paid": "bg-green-50 text-green-700",
    Archived: "bg-slate-50 text-slate-400",
  };

  const statusDots: Record<string, string> = {
    Draft: "bg-slate-400",
    Open: "bg-blue-500",
    "In Progress": "bg-indigo-500",
    "Awaiting Parts": "bg-amber-500",
    "Awaiting Approval": "bg-orange-500",
    "Waiting Customer": "bg-yellow-500",
    "Ready for Signoff": "bg-emerald-500",
    Closed: "bg-slate-400",
    "Invoice Paid": "bg-green-500",
    Archived: "bg-slate-300",
  };

  const stats = {
    total: allWOs.length,
    active: allWOs.filter((w) => ["Open", "In Progress"].includes(w.status)).length,
    awaitingParts: allWOs.filter((w) => w.status === "Awaiting Parts").length,
    readyForSignoff: allWOs.filter((w) => w.status === "Ready for Signoff").length,
    totalValue: allWOs.reduce((s, w) => s + w.grandTotal, 0),
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Work Orders
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {allWOs.length} total · ${stats.totalValue.toLocaleString()} open value
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/maintenance"
            className="inline-flex items-center gap-1.5 border border-border text-muted-foreground px-3 py-2 rounded-lg text-[12px] hover:bg-muted/30 transition-colors"
            style={{ fontWeight: 500 }}
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open in Maintenance View
          </Link>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 bg-[#0A1628] text-white px-4 py-2 rounded-lg text-[13px] hover:bg-[#0A1628]/90 transition-colors"
            style={{ fontWeight: 600 }}
          >
            <Plus className="w-4 h-4" /> New Work Order
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total", value: stats.total, icon: FileText, color: "text-primary" },
          { label: "Active Jobs", value: stats.active, icon: Clock, color: "text-blue-600" },
          { label: "Awaiting Parts", value: stats.awaitingParts, icon: Package, color: "text-amber-600" },
          { label: "Ready for Signoff", value: stats.readyForSignoff, icon: CheckCircle, color: "text-emerald-600" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white rounded-xl border border-border p-4"
          >
            <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
            <div className="text-[24px] text-foreground tracking-tight" style={{ fontWeight: 700 }}>{s.value}</div>
            <div className="text-[12px] text-muted-foreground" style={{ fontWeight: 500 }}>{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-border p-4 mb-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-lg border border-border px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by WO#, aircraft, customer, squawk..."
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-[13px] bg-transparent border border-border rounded-lg px-3 py-2 outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              {Object.keys(statusColors).map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button className="p-2 border border-border rounded-lg hover:bg-muted transition-colors">
              <Download className="w-4 h-4 text-muted-foreground" />
            </button>
            <button className="p-2 border border-border rounded-lg hover:bg-muted transition-colors">
              <Printer className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Wrench className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-[13px]">{searchQuery || statusFilter !== "all" ? "No work orders match your filters" : "No work orders yet"}</p>
            <p className="text-[11px] mt-1">{searchQuery || statusFilter !== "all" ? "Try adjusting your search or filters" : "Create your first work order to get started"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {["WO #", "Aircraft", "Customer", "Squawk / Issue", "Status", "Progress", "Total", "Opened"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] text-muted-foreground uppercase tracking-wider whitespace-nowrap" style={{ fontWeight: 600 }}>{h}</th>
                  ))}
                  <th className="text-right px-4 py-3 text-[11px] text-muted-foreground uppercase tracking-wider" style={{ fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOrders.map((wo, idx) => (
                  <motion.tr
                    key={wo.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-primary" style={{ fontWeight: 700 }}>{wo.woNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-[12px]">
                        <Plane className="w-3 h-3 text-muted-foreground shrink-0" />
                        <div>
                          <div className="text-foreground" style={{ fontWeight: 600 }}>{wo.aircraft}</div>
                          <div className="text-muted-foreground text-[11px] truncate max-w-[120px]">{wo.makeModel.split(" ").slice(0, 3).join(" ")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-foreground truncate max-w-[140px]">{wo.customer}</div>
                      {wo.company && <div className="text-[11px] text-muted-foreground truncate max-w-[140px]">{wo.company}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[12px] text-muted-foreground max-w-[200px] truncate">{wo.squawk || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${statusColors[wo.status] || "bg-muted text-muted-foreground"}`} style={{ fontWeight: 600 }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDots[wo.status] || "bg-muted-foreground"}`} />
                        {wo.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {typeof wo.progress === "number" ? (
                        <div className="flex items-center gap-2 min-w-[80px]">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${wo.progress}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{wo.progress}%</span>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>${wo.grandTotal.toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[12px] text-muted-foreground whitespace-nowrap">{new Date(wo.openedDate).toLocaleDateString()}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href="/maintenance"
                          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                          title="Open in Maintenance"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>
                        <button
                          onClick={() => {
                            if (confirm(`Delete work order ${wo.woNumber}?`)) { deleteWorkOrder(wo.id); toast.success(`${wo.woNumber} deleted.`); }
                          }}
                          className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-destructive transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateWorkOrderModal
            onClose={() => setShowCreateModal(false)}
            onCreated={() => { setShowCreateModal(false); toast.success("Work order created!"); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
