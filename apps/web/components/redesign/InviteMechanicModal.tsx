"use client";

import { useState, useCallback } from "react";
import {
  X, UserPlus, Mail, Phone, User, CheckCircle, Wrench,
  HardHat, AlertCircle, Loader2, Send, Link2, Search,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

interface SearchResult {
  user_id: string;
  org_id: string | null;
  name: string;
  email: string;
  phone: string;
  role: string;
}

interface Props {
  aircraftTail: string;
  aircraftId?: string;
  estimateId?: string;
  onClose: () => void;
  onInvited?: (invite: { invite_id: string; email_sent: boolean; existing_user: boolean }) => void;
}

export function InviteMechanicModal({ aircraftTail, aircraftId, estimateId, onClose, onInvited }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState<SearchResult | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [inviteResult, setInviteResult] = useState<any>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/mechanics/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setSearchResults(json.mechanics ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSearchChange(val: string) {
    setSearchQuery(val);
    doSearch(val);
  }

  function selectExisting(m: SearchResult) {
    setSelectedExisting(m);
    setName(m.name);
    setEmail(m.email);
    setPhone(m.phone);
    setSearchQuery("");
    setSearchResults([]);
  }

  async function handleSubmit() {
    if (!name.trim()) { toast.error("Name is required."); return; }
    if (!email.trim() && !phone.trim()) { toast.error("Email or phone is required."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/mechanics/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mechanic_name: name.trim(),
          mechanic_email: email.trim() || undefined,
          mechanic_phone: phone.trim() || undefined,
          aircraft_id: aircraftId ?? undefined,
          estimate_id: estimateId ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to send invite");
        return;
      }
      setInviteResult(json);
      setSubmitted(true);
      toast.success(`Invite sent to ${email || phone}`);
      onInvited?.({ invite_id: json.invite_id, email_sent: json.email_sent, existing_user: json.existing_user });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
                {inviteResult?.existing_user
                  ? `${name} is already in the myaircraft ecosystem — they've been notified and linked to ${aircraftTail}.`
                  : `An invitation was sent to ${email || phone}. Once accepted, they'll get a 30-day free trial and access to ${aircraftTail} in their mechanic portal.`}
              </p>
              {inviteResult?.existing_user && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                  <Link2 className="w-3.5 h-3.5" />
                  Linked to existing account — no sign-up required
                </div>
              )}
              {!inviteResult?.email_sent && email && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Email delivery not configured — share the invite link manually
                </div>
              )}
              {inviteResult?.invite_url && (
                <div className="mt-3 text-[11px] text-muted-foreground break-all bg-muted/30 rounded-lg px-3 py-2 text-left">
                  <span className="font-medium">Invite link:</span> {inviteResult.invite_url}
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
                Search for a mechanic already in the system, or enter their info to send a new invite. New mechanics get a 30-day free trial.
              </div>

              {/* Live search */}
              <div>
                <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                  Search existing mechanics
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Name, email or phone..."
                    className="w-full border border-border rounded-xl pl-10 pr-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-1 border border-border rounded-xl divide-y overflow-hidden max-h-36 overflow-y-auto">
                    {searchResults.map(m => (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => selectExisting(m)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 text-left"
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-[11px] font-bold text-blue-700 shrink-0">
                          {m.name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{m.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{m.email}{m.phone ? ` · ${m.phone}` : ""}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground capitalize shrink-0">{m.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Ecosystem match banner */}
              <AnimatePresence>
                {selectedExisting && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-200 flex items-center justify-center shrink-0 text-[12px] font-bold text-emerald-800">
                        {selectedExisting.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-[12px] text-emerald-800" style={{ fontWeight: 700 }}>Already in the ecosystem</span>
                        </div>
                        <div className="text-[12px] text-emerald-700">{selectedExisting.name} · {selectedExisting.role}</div>
                        <div className="text-[11px] text-emerald-600">{selectedExisting.email}</div>
                      </div>
                      <button onClick={() => setSelectedExisting(null)} className="text-emerald-500 hover:text-emerald-700">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-[11px] uppercase"><span className="bg-white px-2 text-muted-foreground">Or enter manually</span></div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="mechanic@shop.com"
                    className="w-full border border-border rounded-xl pl-10 pr-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[12px] text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Mike Torres"
                    className="w-full border border-border rounded-xl pl-10 pr-3 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />
                </div>
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
                    { icon: CheckCircle, label: "30-day free trial if they're new to myaircraft" },
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
                  disabled={submitting || !name.trim() || (!email.trim() && !phone.trim())}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-[13px] hover:bg-primary/90 disabled:opacity-40 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                  ) : selectedExisting ? (
                    <><Link2 className="w-4 h-4" /> Send Invite</>
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
