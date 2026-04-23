"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { MyAircraftLogo } from "./MyAircraftLogo";
import { Plane, Lock, Eye, EyeOff, Wrench, Shield, Zap } from "lucide-react";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { createBrowserSupabase } from "@/lib/supabase/browser";

const IMG_COCKPIT = "https://images.unsplash.com/photo-1772354838120-a78234bf7316?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdmlhdGlvbiUyMGNvY2twaXQlMjBsdXh1cnklMjBwcml2YXRlJTIwamV0JTIwaW50ZXJpb3J8ZW58MXx8fHwxNzc1OTYxNDc0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

// Google "G" SVG icon (official brand colors)
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.6150z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8064.5409-1.8382.8605-3.0477.8605-2.3441 0-4.3282-1.5836-5.036-3.7105H.957v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71C3.7841 10.17 3.6818 9.5932 3.6818 9c0-.5932.1023-1.17.2822-1.71V4.9582H.957A8.9965 8.9965 0 0 0 0 9c0 1.4514.3477 2.8259.957 4.0418L3.964 10.71z" fill="#FBBC05"/>
      <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4627.8918 11.4255 0 9 0 5.4818 0 2.4382 2.0168.957 4.9582L3.964 7.29C4.6718 5.1632 6.6559 3.5795 9 3.5795z" fill="#EA4335"/>
    </svg>
  );
}

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [redirectTarget, setRedirectTarget] = useState("/dashboard");
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setRedirectTarget(params.get("redirect") || "/dashboard");
    setSignupSuccess(params.get("signup") === "success");

    const prefilledEmail = params.get("email") || "";
    if (prefilledEmail && !email) {
      setEmail(prefilledEmail);
    }
  }, [email]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError("");
    try {
      const supabase = createBrowserSupabase();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (redirectTarget && redirectTarget.startsWith("/")) {
        callbackUrl.searchParams.set("next", redirectTarget);
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      });
      if (oauthError) {
        // Supabase returns an error when provider is not configured
        if (oauthError.message?.toLowerCase().includes("provider") || oauthError.message?.toLowerCase().includes("not enabled")) {
          setError("Google sign-in not configured yet — ask your admin.");
        } else {
          setError(oauthError.message);
        }
        setGoogleLoading(false);
      }
      // On success Supabase redirects the browser, no further action needed
    } catch {
      setError("Google sign-in not configured yet — ask your admin.");
      setGoogleLoading(false);
    }
  };

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Sign in failed");
        setLoading(false);
        return;
      }

      window.location.href = redirectTarget;
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0A1628]">

      {/* ── Left Panel — branding (hidden on mobile) ── */}
      <div className="hidden md:flex md:w-[52%] relative overflow-hidden flex-col">
        <ImageWithFallback
          src={IMG_COCKPIT}
          alt="Cockpit"
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A1628]/95 via-[#0A1628]/70 to-[#1E3A5F]/80" />

        {/* Background grid */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "40px 40px"
        }} />

        <div className="relative z-10 flex flex-col h-full p-12">
          {/* Logo */}
          <Link href="/" className="flex items-center group w-fit">
            <MyAircraftLogo variant="light" height={32} />
          </Link>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 bg-[#2563EB]/20 border border-[#2563EB]/30 rounded-full px-3.5 py-1.5 mb-5">
                <Shield className="w-3.5 h-3.5 text-[#2563EB]" />
                <span className="text-[#60a5fa] text-[11px]" style={{ fontWeight: 700, letterSpacing: "0.06em" }}>AIRCRAFT RECORDS INTELLIGENCE</span>
              </div>
              <h2 className="text-white text-[38px] tracking-tight mb-4" style={{ fontWeight: 800, lineHeight: 1.1 }}>
                Your aircraft records.<br />
                <span className="text-[#2563EB]">Searchable.</span><br />
                <span className="text-white/70">Intelligent.</span>
              </h2>
              <p className="text-white/50 text-[15px] leading-relaxed max-w-sm">
                Source-backed answers from your logbooks, maintenance history, ADs, and inspections — available from anywhere, any device.
              </p>
            </div>

            {/* Feature chips */}
            <div className="space-y-3">
              {[
                { icon: Zap, label: "AI-powered answers from your actual logbooks", color: "text-[#2563EB]" },
                { icon: Shield, label: "AD & compliance tracking with smart reminders", color: "text-emerald-400" },
                { icon: Lock, label: "AES-256 encrypted · Daily backups · SOC 2 compliant", color: "text-violet-400" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <span className="text-white/55 text-[13px]">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
            {[
              { val: "50K+", label: "Documents Indexed" },
              { val: "99.9%", label: "Uptime SLA" },
              { val: "14-day", label: "Free Trial" },
            ].map((stat) => (
              <div key={stat.val}>
                <div className="text-white text-[20px] tracking-tight" style={{ fontWeight: 800 }}>{stat.val}</div>
                <div className="text-white/40 text-[11px]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right Panel — form ── */}
      <div className="flex-1 flex items-center justify-center px-4 md:px-8 py-10 bg-white relative">
        {/* Subtle top-left accent */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-[#2563EB]/5 to-transparent rounded-br-full" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[380px]"
        >
          {/* Mobile logo — centered */}
          <div className="md:hidden flex justify-center mb-8">
            <Link href="/">
              <MyAircraftLogo variant="dark" height={28} />
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-[28px] tracking-tight text-[#0A1628] mb-1.5" style={{ fontWeight: 800 }}>Welcome back</h1>
            <p className="text-[14px] text-[#64748b]">Sign in to your aircraft records account</p>
          </div>

          {signupSuccess && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-[13px]">
              Account created. Check your inbox to confirm your email if prompted, then sign in to continue your owner onboarding.
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[13px]">
              {error}
            </div>
          )}

          {/* Google OAuth button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 h-12 rounded-xl border border-[rgba(15,23,42,0.15)] bg-white hover:bg-[#f8f9fb] transition-colors text-[14px] text-[#0A1628] mb-4 shadow-sm disabled:opacity-70"
            style={{ fontWeight: 600 }}
          >
            <GoogleIcon />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[rgba(15,23,42,0.08)]" />
            <span className="text-[12px] text-[#94a3b8]" style={{ fontWeight: 500 }}>or continue with email</span>
            <div className="flex-1 h-px bg-[rgba(15,23,42,0.08)]" />
          </div>

          <form onSubmit={handleSignIn} className="space-y-4 mb-5">
            <div>
              <label className="block text-[13px] text-[#0A1628] mb-1.5" style={{ fontWeight: 600 }}>Email address</label>
              <input
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-[rgba(15,23,42,0.12)] rounded-xl px-4 h-12 text-[14px] bg-[#f8f9fb] focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all text-[#0A1628] placeholder-[#94a3b8]"
              />
            </div>
            <div>
              <label className="block text-[13px] text-[#0A1628] mb-1.5" style={{ fontWeight: 600 }}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-[rgba(15,23,42,0.12)] rounded-xl px-4 h-12 pr-11 text-[14px] bg-[#f8f9fb] focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all text-[#0A1628] placeholder-[#94a3b8]"
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
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-[rgba(15,23,42,0.15)] w-4 h-4 accent-[#2563EB]" />
                <span className="text-[13px] text-[#64748b]">Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-[13px] text-[#2563EB] cursor-pointer hover:underline" style={{ fontWeight: 500 }}>
                Forgot password?
              </Link>
            </div>
          </form>

          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#0A1628] to-[#1E3A5F] text-white text-center h-12 rounded-xl text-[14px] hover:from-[#1E3A5F] hover:to-[#2563EB] transition-all shadow-lg shadow-[#0A1628]/20 mb-4 disabled:opacity-70"
            style={{ fontWeight: 600 }}
          >
            {loading ? "Signing in…" : "Sign in to myaircraft"}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-[rgba(15,23,42,0.08)]" />
            <span className="text-[12px] text-[#94a3b8]" style={{ fontWeight: 500 }}>or try a demo</span>
            <div className="flex-1 h-px bg-[rgba(15,23,42,0.08)]" />
          </div>

          {/* Demo buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Link
              href="/app"
              className="flex items-center justify-center gap-2 h-12 rounded-xl border border-[rgba(15,23,42,0.12)] text-[#0A1628] hover:bg-[#f8f9fb] transition-colors text-[13px] bg-white"
              style={{ fontWeight: 600 }}
            >
              <Plane className="w-4 h-4 text-[#2563EB]" />
              Owner Demo
            </Link>
            <Link
              href="/app/mechanic"
              className="flex items-center justify-center gap-2 h-12 rounded-xl border border-[rgba(15,23,42,0.12)] text-[#0A1628] hover:bg-[#f8f9fb] transition-colors text-[13px] bg-white"
              style={{ fontWeight: 600 }}
            >
              <Wrench className="w-4 h-4 text-[#1E3A5F]" />
              Mechanic Demo
            </Link>
          </div>

          <p className="text-center text-[13px] text-[#64748b]">
            Don&apos;t have an account?{" "}
            <Link href="/signup?preview=1" className="text-[#2563EB] hover:underline" style={{ fontWeight: 600 }}>
              Start free 14-day trial
            </Link>
          </p>

          {/* Security note */}
          <div className="mt-8 pt-6 border-t border-[rgba(15,23,42,0.06)] flex items-center justify-center gap-2 text-[11px] text-[#94a3b8]">
            <Lock className="w-3.5 h-3.5" />
            <span>AES-256 encrypted · SOC 2 Type II · Not affiliated with the FAA</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
