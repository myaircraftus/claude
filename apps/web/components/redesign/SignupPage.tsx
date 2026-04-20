"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plane, Lock, Eye, EyeOff, CheckCircle, Shield, Wrench, Users, Star, ChevronRight } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { FormEvent, useState } from "react";
import { motion } from "motion/react";
import { MyAircraftLogo } from "./MyAircraftLogo";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const IMG_AUTH = "https://images.unsplash.com/photo-1772354838120-a78234bf7316?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdmlhdGlvbiUyMGNvY2twaXQlMjBsdXh1cnklMjBwcml2YXRlJTIwamV0JTIwaW50ZXJpb3J8ZW58MXx8fHwxNzc1OTYxNDc0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

const personas = [
  {
    value: "owner",
    label: "Aircraft Owner",
    icon: Plane,
    desc: "I own or co-own one or more aircraft",
    color: "border-[#2563EB] bg-[#EFF6FF]",
    iconColor: "text-[#2563EB]",
  },
  {
    value: "mechanic",
    label: "A&P Mechanic",
    icon: Wrench,
    desc: "I'm a certified A&P and/or IA",
    color: "border-[#1E3A5F] bg-[#F0F4FF]",
    iconColor: "text-[#1E3A5F]",
  },
  {
    value: "fleet",
    label: "Fleet Operator",
    icon: Users,
    desc: "I manage a fleet of aircraft (FBO, school, charter)",
    color: "border-[#0A1628] bg-[#f0f4f8]",
    iconColor: "text-[#0A1628]",
  },
];

export function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState("owner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const router = useRouter();

  const handleCreate = async (event?: FormEvent) => {
    event?.preventDefault();

    if (!email || !password) {
      setError("Please enter an email and password.");
      return;
    }

    if (!acceptedTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createBrowserSupabase();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          data: {
            first_name: firstName,
            last_name: lastName,
            persona: selectedPersona,
          },
        },
      });

      if (signUpError) {
        const normalizedMessage =
          signUpError.message.toLowerCase().includes("invalid")
            ? "Please use a valid deliverable email address."
            : signUpError.message;
        setError(normalizedMessage);
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push("/onboarding");
        return;
      }

      const next = new URLSearchParams({
        signup: "success",
        redirect: "/onboarding",
        email,
      });
      router.push(`/login?${next.toString()}`);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0A1628]">

      {/* ── Left Panel ── */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden flex-col">
        <ImageWithFallback
          src={IMG_AUTH}
          alt="Aircraft interior"
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A1628]/97 via-[#0A1628]/80 to-[#1E3A5F]/70" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <Link href="/" className="flex items-center group w-fit">
            <MyAircraftLogo variant="light" height={32} />
          </Link>

          <div className="flex-1 flex flex-col justify-center">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-3.5 py-1.5 mb-5">
                <Star className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 text-[11px]" style={{ fontWeight: 700, letterSpacing: "0.06em" }}>14-DAY FREE TRIAL — NO CARD NEEDED</span>
              </div>
              <h2 className="text-white text-[36px] tracking-tight mb-4" style={{ fontWeight: 800, lineHeight: 1.15 }}>
                Start organizing<br />
                your records today.
              </h2>
              <p className="text-white/50 text-[15px] leading-relaxed max-w-sm">
                Join thousands of pilots, mechanics, and fleet operators who trust myaircraft.us to manage their aircraft records intelligently.
              </p>
            </div>

            {/* Benefits */}
            <div className="space-y-4 mb-8">
              {[
                { icon: Plane, label: "Aircraft Owner", val: "AI-powered logbook Q&A, AD tracking, smart reminders", color: "bg-[#2563EB]" },
                { icon: Wrench, label: "A&P Mechanic", val: "AI logbook generation, work orders, e-signatures, invoicing", color: "bg-[#1E3A5F]" },
                { icon: Users, label: "Fleet Operator", val: "Centralized fleet management, team roles, compliance dashboard", color: "bg-[#0d1f3c]" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-xl ${item.color} border border-white/10 flex items-center justify-center shrink-0`}>
                    <item.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-white text-[12px]" style={{ fontWeight: 700 }}>{item.label}</div>
                    <div className="text-white/40 text-[12px]">{item.val}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Trust indicators */}
            <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-6">
              {[
                { val: "Free", label: "14-day trial" },
                { val: "$0", label: "Scanning cost" },
                { val: "∞", label: "Team members" },
              ].map((stat) => (
                <div key={stat.val} className="text-center">
                  <div className="text-white text-[22px] tracking-tight" style={{ fontWeight: 800 }}>{stat.val}</div>
                  <div className="text-white/40 text-[11px]">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Panel — form ── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white relative overflow-y-auto">
        <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#2563EB]/5 to-transparent rounded-bl-full" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px] py-8"
        >
          {/* Mobile logo */}
          <Link href="/" className="lg:hidden flex items-center mb-8 group w-fit">
            <MyAircraftLogo variant="dark" height={28} />
          </Link>

          <div className="mb-7">
            <h1 className="text-[28px] tracking-tight text-[#0A1628] mb-1.5" style={{ fontWeight: 800 }}>Create your account</h1>
            <p className="text-[14px] text-[#64748b]">14-day free trial · No credit card required</p>
          </div>

          {/* Persona selector */}
          <div className="mb-5">
            <label className="block text-[13px] text-[#0A1628] mb-2.5" style={{ fontWeight: 600 }}>I am a…</label>
            <div className="space-y-2">
              {personas.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setSelectedPersona(p.value)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                    selectedPersona === p.value ? p.color : "border-[rgba(15,23,42,0.08)] bg-white hover:bg-[#f8f9fb]"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    selectedPersona === p.value ? "bg-white/70" : "bg-[#f1f3f8]"
                  }`}>
                    <p.icon className={`w-4 h-4 ${selectedPersona === p.value ? p.iconColor : "text-[#64748b]"}`} />
                  </div>
                  <div className="flex-1">
                    <div className={`text-[13px] ${selectedPersona === p.value ? "text-[#0A1628]" : "text-[#374151]"}`} style={{ fontWeight: 600 }}>{p.label}</div>
                    <div className={`text-[11px] ${selectedPersona === p.value ? "text-[#64748b]" : "text-[#94a3b8]"}`}>{p.desc}</div>
                  </div>
                  {selectedPersona === p.value && <CheckCircle className={`w-4 h-4 shrink-0 ${p.iconColor}`} />}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[13px]">
              {error}
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-4 mb-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] text-[#0A1628] mb-1.5" style={{ fontWeight: 600 }}>First name</label>
                <input
                  type="text"
                  placeholder="John"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="w-full border border-[rgba(15,23,42,0.12)] rounded-xl px-4 py-3 text-[14px] bg-[#f8f9fb] focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all text-[#0A1628] placeholder-[#94a3b8]"
                />
              </div>
              <div>
                <label className="block text-[13px] text-[#0A1628] mb-1.5" style={{ fontWeight: 600 }}>Last name</label>
                <input
                  type="text"
                  placeholder="Mitchell"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="w-full border border-[rgba(15,23,42,0.12)] rounded-xl px-4 py-3 text-[14px] bg-[#f8f9fb] focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all text-[#0A1628] placeholder-[#94a3b8]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[13px] text-[#0A1628] mb-1.5" style={{ fontWeight: 600 }}>Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-[rgba(15,23,42,0.12)] rounded-xl px-4 py-3 text-[14px] bg-[#f8f9fb] focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all text-[#0A1628] placeholder-[#94a3b8]"
              />
            </div>
            <div>
              <label className="block text-[13px] text-[#0A1628] mb-1.5" style={{ fontWeight: 600 }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-[rgba(15,23,42,0.12)] rounded-xl px-4 py-3 pr-11 text-[14px] bg-[#f8f9fb] focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all text-[#0A1628] placeholder-[#94a3b8]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Terms */}
            <label className="flex items-start gap-2.5 mb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
                className="mt-0.5 rounded w-4 h-4 accent-[#2563EB] shrink-0"
              />
              <span className="text-[12px] text-[#64748b] leading-relaxed">
                I agree to the{" "}
                <a href="/terms" className="text-[#2563EB] hover:underline" style={{ fontWeight: 500 }}>Terms of Service</a>
                {" "}and{" "}
                <a href="/privacy" className="text-[#2563EB] hover:underline" style={{ fontWeight: 500 }}>Privacy Policy</a>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#0A1628] to-[#1E3A5F] text-white text-center py-3.5 rounded-xl text-[14px] hover:from-[#1E3A5F] hover:to-[#2563EB] transition-all shadow-lg shadow-[#0A1628]/20 disabled:opacity-70"
              style={{ fontWeight: 600 }}
            >
              {loading ? "Creating account…" : "Create Account — Free Trial"}
            </button>
          </form>

          {/* Or demo */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[rgba(15,23,42,0.08)]" />
            <span className="text-[12px] text-[#94a3b8]" style={{ fontWeight: 500 }}>or explore first</span>
            <div className="flex-1 h-px bg-[rgba(15,23,42,0.08)]" />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <Link
              href="/app"
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[rgba(15,23,42,0.12)] text-[#0A1628] hover:bg-[#f8f9fb] transition-colors text-[13px] bg-white"
              style={{ fontWeight: 600 }}
            >
              <Plane className="w-4 h-4 text-[#2563EB]" />
              Owner Demo
            </Link>
            <Link
              href="/app/mechanic"
              className="flex items-center justify-center gap-2 py-3 rounded-xl border border-[rgba(15,23,42,0.12)] text-[#0A1628] hover:bg-[#f8f9fb] transition-colors text-[13px] bg-white"
              style={{ fontWeight: 600 }}
            >
              <Wrench className="w-4 h-4 text-[#1E3A5F]" />
              Mechanic Demo
            </Link>
          </div>

          <p className="text-center text-[13px] text-[#64748b]">
            Already have an account?{" "}
            <Link href="/login?preview=1" className="text-[#2563EB] hover:underline" style={{ fontWeight: 600 }}>Sign in</Link>
          </p>

          <div className="mt-6 pt-6 border-t border-[rgba(15,23,42,0.06)] flex items-center justify-center gap-2 text-[11px] text-[#94a3b8]">
            <Lock className="w-3.5 h-3.5" />
            <span>AES-256 encrypted · SOC 2 Type II · Not affiliated with the FAA</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
