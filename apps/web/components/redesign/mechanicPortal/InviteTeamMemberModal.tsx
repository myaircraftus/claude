"use client";

import { useState } from "react";
import { X, Send } from "lucide-react";
import { motion } from "motion/react";

export function InviteTeamMemberModal({ onClose, onInvite }: { onClose: () => void; onInvite: (m: any) => void }) {
  const AVATAR_COLORS = ["bg-blue-600 text-white", "bg-violet-600 text-white", "bg-emerald-600 text-white", "bg-orange-600 text-white", "bg-pink-600 text-white"];
  const [form, setForm] = useState({ name: "", email: "", role: "Mechanic" as any, licenseType: "A&P Mechanic" as any, licenseNumber: "", rate: 95, specialty: "" });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const needsLicense = form.licenseType === "A&P/IA" || form.licenseType === "A&P Mechanic";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
        transition={{ duration: 0.14 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-[#0A1628]">
          <div className="text-white text-[14px]" style={{ fontWeight: 700 }}>Invite Team Member</div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Full Name *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Jane Smith"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" autoFocus />
          </div>
          <div>
            <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Email *</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="mechanic@shop.com"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Role</label>
              <select value={form.role} onChange={e => set("role", e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none bg-white focus:ring-2 focus:ring-primary/20">
                {["Lead Mechanic / IA", "Mechanic", "Apprentice Mechanic", "Read Only"].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>License Type</label>
              <select value={form.licenseType} onChange={e => set("licenseType", e.target.value)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none bg-white focus:ring-2 focus:ring-primary/20">
                {["A&P/IA", "A&P Mechanic", "Student A&P", "None"].map(lt => <option key={lt}>{lt}</option>)}
              </select>
            </div>
          </div>
          {needsLicense && (
            <div>
              <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>License Number <span className="text-red-500">*</span></label>
              <input value={form.licenseNumber} onChange={e => set("licenseNumber", e.target.value)} placeholder="FAA certificate number"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" style={{ fontWeight: 600 }} />
              <p className="text-[11px] text-muted-foreground mt-1">Required for A&P and IA certifications.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Labor Rate ($/hr)</label>
              <input type="number" min="0" value={form.rate} onChange={e => set("rate", parseFloat(e.target.value) || 0)}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" style={{ fontWeight: 600 }} />
            </div>
            <div>
              <label className="block text-[12px] text-foreground mb-1" style={{ fontWeight: 600 }}>Specialty</label>
              <input value={form.specialty} onChange={e => set("specialty", e.target.value)} placeholder="e.g. Powerplant"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[12px] text-blue-700">
            An invitation email will be sent. They'll set their own password on first login.
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-border bg-[#F7F8FA]">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-[13px] text-muted-foreground hover:bg-muted/30 transition-colors" style={{ fontWeight: 500 }}>Cancel</button>
          <button
            disabled={!form.name.trim() || !form.email.trim() || (needsLicense && !form.licenseNumber.trim())}
            onClick={() => {
              const initials = form.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
              const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
              onInvite({
                name: form.name, email: form.email, role: form.role,
                licenseType: form.licenseType, licenseNumber: form.licenseNumber,
                rate: form.rate, specialty: form.specialty,
                cert: form.licenseType === "None" || form.licenseType === "Student A&P" ? form.licenseType : `${form.licenseType} #${form.licenseNumber}`,
                color, initials, status: "Invited",
                permissions: { aiCommandCenter: false, dashboard: false, aircraft: false, squawks: false, estimates: false, workOrders: true, invoices: false, logbook: false, settingsFull: false, woLineItems: false, woOwnersView: false, woCloseWO: false, woInvoice: false },
              });
            }}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors" style={{ fontWeight: 600 }}>
            <Send className="w-3.5 h-3.5" /> Send Invitation
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
