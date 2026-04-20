"use client";

import { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Mail, Phone, MapPin, MessageSquare, CheckCircle,
  Clock, Plane, Wrench, BookOpen, ArrowRight, Send,
} from "lucide-react";

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

const CONTACT_OPTIONS = [
  {
    icon: <Plane className="w-5 h-5" />,
    title: "Aircraft Owners",
    desc: "Questions about uploading records, scanning service, or understanding your aircraft's compliance status.",
    email: "owners@myaircraft.us",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  {
    icon: <Wrench className="w-5 h-5" />,
    title: "Mechanics & Shops",
    desc: "Setting up your Mechanic Portal, work orders, estimates, invoicing, and customer management.",
    email: "mechanics@myaircraft.us",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  {
    icon: <BookOpen className="w-5 h-5" />,
    title: "Enterprise & Fleet",
    desc: "Volume pricing, on-site training, custom integrations, and white-label solutions for fleet operators.",
    email: "enterprise@myaircraft.us",
    color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  },
];

const FAQS = [
  {
    q: "How long does the scanning service take?",
    a: "For most single-aircraft logbook sets (4–6 volumes), we complete the scan in 2–4 hours on-site. We schedule a convenient time, come to your hangar, and you have the digital records the same day.",
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes. You can cancel from your account settings at any time. Your records remain accessible for 30 days after cancellation, giving you time to export everything.",
  },
  {
    q: "Is my data private?",
    a: "Absolutely. Your aircraft records are encrypted at rest and in transit. They are never shared, sold, or used to train public AI models. Access is controlled per account and per role.",
  },
  {
    q: "Do you support multi-aircraft or fleet accounts?",
    a: "Yes. Enterprise accounts support unlimited aircraft, multiple owners, and team-based access control. Contact us for fleet pricing.",
  },
  {
    q: "Does myaircraft.us replace my physical logbooks?",
    a: "No — physical logbooks remain the legal record of maintenance. myaircraft.us is a digital intelligence layer: searchable, queryable, and always current — but your paper records remain the FAA-recognized authority.",
  },
];

type FormState = "idle" | "sending" | "sent";

export function ContactPage() {
  const [formState, setFormState] = useState<FormState>("idle");
  const [form, setForm] = useState({ name: "", email: "", role: "owner", subject: "", message: "" });
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormState("sending");
    setTimeout(() => setFormState("sent"), 1800);
  };

  return (
    <div className="bg-[#0A1628] min-h-screen">

      {/* ── Hero ── */}
      <section className="relative pt-24 pb-16 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1E3A5F]/40 to-transparent pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-[#2563EB]/15 border border-[#2563EB]/30 rounded-full px-4 py-1.5 mb-6">
              <MessageSquare className="w-3.5 h-3.5 text-[#60a5fa]" />
              <span className="text-[#60a5fa] text-[12px]" style={{ fontWeight: 700, letterSpacing: "0.07em" }}>GET IN TOUCH</span>
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <h1 className="text-white text-[48px] tracking-tight mb-4 leading-[1.15]" style={{ fontWeight: 900 }}>
              We're here to help
            </h1>
          </FadeIn>
          <FadeIn delay={0.14}>
            <p className="text-white/45 text-[17px] leading-relaxed">
              Questions, scanning requests, enterprise inquiries, or just want to talk aviation — we respond within one business day.
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── Contact options ── */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CONTACT_OPTIONS.map((opt, i) => (
              <FadeIn key={opt.title} delay={i * 0.07}>
                <div className="bg-[#0d1f3c] border border-white/8 rounded-2xl p-5">
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-4 ${opt.color}`}>
                    {opt.icon}
                  </div>
                  <h3 className="text-white text-[16px] mb-2" style={{ fontWeight: 700 }}>{opt.title}</h3>
                  <p className="text-white/40 text-[13px] leading-relaxed mb-4">{opt.desc}</p>
                  <a href={`mailto:${opt.email}`} className="text-[#60a5fa] hover:text-[#93c5fd] text-[13px] transition-colors flex items-center gap-1.5" style={{ fontWeight: 500 }}>
                    <Mail className="w-3.5 h-3.5" /> {opt.email}
                  </a>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Form + Info ── */}
      <section className="px-4 pb-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-5 gap-8">

          {/* Form */}
          <FadeIn className="md:col-span-3">
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-8">
              <h2 className="text-white text-[22px] mb-6" style={{ fontWeight: 700 }}>Send us a message</h2>

              {formState === "sent" ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-white text-[20px] mb-2" style={{ fontWeight: 700 }}>Message sent!</h3>
                  <p className="text-white/45 text-[14px]">We'll respond within one business day. Usually much faster.</p>
                  <button onClick={() => { setFormState("idle"); setForm({ name: "", email: "", role: "owner", subject: "", message: "" }); }}
                    className="mt-6 text-[#60a5fa] hover:text-[#93c5fd] text-[13px] transition-colors" style={{ fontWeight: 500 }}>
                    Send another message →
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-white/50 text-[12px] mb-1.5" style={{ fontWeight: 600 }}>NAME</label>
                      <input
                        required
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Your name"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-[14px] focus:outline-none focus:border-[#2563EB]/60 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-white/50 text-[12px] mb-1.5" style={{ fontWeight: 600 }}>EMAIL</label>
                      <input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="your@email.com"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-[14px] focus:outline-none focus:border-[#2563EB]/60 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-white/50 text-[12px] mb-1.5" style={{ fontWeight: 600 }}>I AM A…</label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[14px] focus:outline-none focus:border-[#2563EB]/60 transition-colors appearance-none"
                    >
                      <option value="owner" className="bg-[#0d1f3c]">Aircraft Owner / Pilot</option>
                      <option value="mechanic" className="bg-[#0d1f3c]">A&P Mechanic / IA</option>
                      <option value="shop" className="bg-[#0d1f3c]">Maintenance Shop / FBO</option>
                      <option value="fleet" className="bg-[#0d1f3c]">Fleet Operator / Part 135</option>
                      <option value="other" className="bg-[#0d1f3c]">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-white/50 text-[12px] mb-1.5" style={{ fontWeight: 600 }}>SUBJECT</label>
                    <input
                      required
                      type="text"
                      value={form.subject}
                      onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      placeholder="What can we help you with?"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-[14px] focus:outline-none focus:border-[#2563EB]/60 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-white/50 text-[12px] mb-1.5" style={{ fontWeight: 600 }}>MESSAGE</label>
                    <textarea
                      required
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Tell us about your aircraft, shop, or question…"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-[14px] focus:outline-none focus:border-[#2563EB]/60 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={formState === "sending"}
                    className="w-full flex items-center justify-center gap-2 bg-[#2563EB] hover:bg-[#1d4ed8] disabled:opacity-70 text-white py-3.5 rounded-xl text-[14px] transition-all shadow-lg shadow-blue-900/30"
                    style={{ fontWeight: 700 }}
                  >
                    {formState === "sending" ? (
                      <><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Sending…</>
                    ) : (
                      <><Send className="w-4 h-4" /> Send Message</>
                    )}
                  </button>
                </form>
              )}
            </div>
          </FadeIn>

          {/* Info panel */}
          <FadeIn delay={0.1} className="md:col-span-2 space-y-5">
            {/* Contact details */}
            <div className="bg-[#0d1f3c] border border-white/8 rounded-2xl p-6 space-y-4">
              <h3 className="text-white text-[16px] mb-4" style={{ fontWeight: 700 }}>Contact details</h3>
              {[
                { icon: <Mail className="w-4 h-4" />, label: "General", val: "hello@myaircraft.us", href: "mailto:hello@myaircraft.us" },
                { icon: <Phone className="w-4 h-4" />, label: "Phone", val: "+1 (512) 555-0142", href: "tel:+15125550142" },
                { icon: <MapPin className="w-4 h-4" />, label: "HQ", val: "Austin, Texas", href: undefined },
                { icon: <Clock className="w-4 h-4" />, label: "Response time", val: "< 1 business day", href: undefined },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <div className="text-white/35 text-[11px]">{item.label}</div>
                    {item.href ? (
                      <a href={item.href} className="text-white/75 text-[13px] hover:text-white transition-colors">{item.val}</a>
                    ) : (
                      <div className="text-white/75 text-[13px]">{item.val}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Scanning request shortcut */}
            <div className="bg-gradient-to-br from-[#2563EB]/15 to-[#1E3A5F]/20 border border-[#2563EB]/25 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Plane className="w-4 h-4 text-[#60a5fa]" />
                <span className="text-white text-[14px]" style={{ fontWeight: 700 }}>Book Free Scanning</span>
              </div>
              <p className="text-white/45 text-[13px] leading-relaxed mb-4">
                We come to your hangar and scan your entire records archive. Free for all subscribers.
              </p>
              <a
                href="mailto:scanning@myaircraft.us?subject=Scanning Service Request"
                className="flex items-center gap-1.5 text-[#60a5fa] hover:text-[#93c5fd] text-[13px] transition-colors"
                style={{ fontWeight: 600 }}
              >
                Schedule a scan <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-4 py-16 bg-[#060f1e]">
        <div className="max-w-3xl mx-auto">
          <FadeIn className="text-center mb-10">
            <h2 className="text-white text-[32px] mb-3" style={{ fontWeight: 800 }}>Common questions</h2>
            <p className="text-white/40 text-[15px]">Quick answers before you reach out.</p>
          </FadeIn>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <FadeIn key={faq.q} delay={i * 0.05}>
                <div className="bg-[#0d1f3c] border border-white/8 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left"
                  >
                    <span className="text-white text-[14px] pr-4" style={{ fontWeight: 600 }}>{faq.q}</span>
                    <span className="text-white/40 text-[20px] shrink-0 leading-none">{openFaq === i ? "−" : "+"}</span>
                  </button>
                  {openFaq === i && (
                    <div className="px-6 pb-5">
                      <div className="h-px bg-white/8 mb-4" />
                      <p className="text-white/55 text-[14px] leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
