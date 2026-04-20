"use client";

import { useState } from "react";
import {
  X, UserPlus, Mail, Phone, User, CheckCircle, Wrench,
  HardHat, AlertCircle, Loader2, Send, Link2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppContext } from "./AppContext";
import { toast } from "sonner";

interface Props {
  aircraftTail: string;
  onClose: () => void;
}

export function InviteMechanicModal({ aircraftTail, onClose }: Props) {
  const { team, addAircraftAssignment, aircraftAssignments } = useAppContext();

  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /* ── ecosystem lookup: match email against existing team members ── */
  const emailLower = email.trim().toLowerCase();
  const ecosystemMatch = emailLower.length > 5
    ? team.find(m => m.email.toLowerCase() === emailLower)
    : undefined;

  /* ── check if already assigned to this aircraft ── */
  const alreadyAssigned = aircraftAssignments.some(
    a => a.aircraftTail === aircraftTail && a.email.toLowerCase() === emailLower
  );

  function handleEmailChange(val: string) {
    setEmail(val);
    if (val.trim().toLowerCase() === ecosystemMatch?.email.toLowerCase() && ecosystemMatch) {
      // Auto-fill name from ecosystem match
      if (!name) setName(ecosystemMatch.name);
    }
  }

  function handleSubmit() {
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    if (alreadyAssigned) {
      toast.error("This mechanic is already assigned to this aircraft.");
      return;
    }

    setChecking(true);
    // Simulate a brief "sending" delay
    setTimeout(() => {
      addAircraftAssignment({
        aircraftTail,
        name:  ecosystemMatch ? ecosystemMatch.name : name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        status: "Invited",
        enabled: true,
        linkedTeamMemberId: ecosystemMatch?.id,
        invitedAt: new Date().toISOString().slice(0, 10),
      });
      setChecking(false);
      setSubmitted(true);
      toast.success(`Invite sent to ${email.trim()}`);
    }, 900);
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.18 }}
          className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0A1628] to-[#1E3A5F] px-6 py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-white text-[15px]" style={{ fontWeight: 700 }}>Invite Mechanic</div>
                  <div className="text-white/50 text-[11px]">{aircraftTail} · assign maintenance access</div>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>
          </div>

          {submitted ? (
            /* ── Success state ── */
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <Send className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="text-[16px] text-foreground mb-1" style={{ fontWeight: 700 }}>Invite Sent!</div>
              <p className="text-[13px] text-muted-foreground mb-1">
                {ecosystemMatch
                  ? `${ecosystemMatch.name} is already in the myaircraft ecosystem — they've been notified and linked to ${aircraftTail}.`
                  : `An invitation was sent to ${email}. Once accepted, they'll be able to access ${aircraftTail} in their mechanic portal.`}
              </p>
              {ecosystemMatch && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                  <Link2 className="w-3.5 h-3.5" />
                  Linked to existing account — no sign-up required
                </div>
              )}
              <button
                onClick={onClose}
                className="mt-5 bg-primary text-white px-6 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 transition-colors"
                style={{ fontWeight: 600 }}
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Form state ── */
            <div className="p-6 space-y-5">
              {/* Info banner */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[12px] text-blue-700 leading-relaxed">
                Enter the mechanic's email. If they're already in the myaircraft ecosystem, their profile will auto-link. Otherwise they'll receive an email invite.
              </div>

              {/* Email first (triggers lookup) */}
              <div>
                <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                  Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => handleEmailChange(e.target.value)}
                    placeholder="mechanic@shop.com"
                    className="w-full border border-border rounded-xl pl-10 pr-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
              </div>

              {/* Ecosystem match banner */}
              <AnimatePresence>
                {ecosystemMatch && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <div className={`w-9 h-9 rounded-full ${ecosystemMatch.color} flex items-center justify-center shrink-0 text-[12px]`} style={{ fontWeight: 700 }}>
                        {ecosystemMatch.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-[12px] text-emerald-800" style={{ fontWeight: 700 }}>Already in the ecosystem</span>
                        </div>
                        <div className="text-[12px] text-emerald-700">{ecosystemMatch.name} · {ecosystemMatch.role}</div>
                        <div className="text-[11px] text-emerald-600">{ecosystemMatch.cert} · Rate: ${ecosystemMatch.rate}/hr</div>
                      </div>
                      <Link2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Already assigned warning */}
              <AnimatePresence>
                {alreadyAssigned && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-[12px] text-amber-800" style={{ fontWeight: 500 }}>This mechanic is already assigned to {aircraftTail}.</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Name */}
              <div>
                <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={ecosystemMatch ? ecosystemMatch.name : name}
                    onChange={e => setName(e.target.value)}
                    disabled={!!ecosystemMatch}
                    placeholder="Mike Torres"
                    className="w-full border border-border rounded-xl pl-10 pr-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 disabled:opacity-60 disabled:bg-muted/20"
                  />
                </div>
                {ecosystemMatch && (
                  <p className="text-[11px] text-muted-foreground mt-1">Auto-filled from ecosystem profile.</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                  Phone <span className="text-muted-foreground/50">(optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(512) 555-0100"
                    className="w-full border border-border rounded-xl pl-10 pr-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
              </div>

              {/* What they'll get access to */}
              <div className="bg-muted/30 rounded-xl p-4">
                <div className="text-[11px] text-muted-foreground mb-2" style={{ fontWeight: 600 }}>MECHANIC WILL GET ACCESS TO</div>
                <div className="space-y-1.5">
                  {[
                    { icon: HardHat, label: `${aircraftTail} in their Mechanic Portal` },
                    { icon: Wrench, label: "Squawks, estimates, and work orders for this aircraft" },
                    { icon: CheckCircle, label: "Ability to accept or decline the invitation" },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 border border-border text-muted-foreground px-4 py-2.5 rounded-xl text-[13px] hover:bg-muted/30 transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={checking || !email.trim() || (!name.trim() && !ecosystemMatch) || alreadyAssigned}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  {checking ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  ) : ecosystemMatch ? (
                    <><Link2 className="w-4 h-4" /> Link & Assign</>
                  ) : (
                    <><Send className="w-4 h-4" /> Send Invite</>
                  )}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
