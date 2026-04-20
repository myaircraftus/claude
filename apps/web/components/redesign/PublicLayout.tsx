"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Zap, Wrench } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { MyAircraftLogo } from "./MyAircraftLogo";

const navLinks = [
  { label: "Features",   href: "/features" },
  { label: "Pricing",    href: "/pricing" },
  { label: "Scanning",   href: "/scanning" },
  { label: "About",      href: "/about" },
  { label: "Blog",       href: "/blog" },
];

export function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showDemoMenu, setShowDemoMenu] = useState(false);
  const demoMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentRef = demoMenuRef.current;
    const handleClickOutside = (event: MouseEvent) => {
      if (currentRef && !currentRef.contains(event.target as Node)) {
        setShowDemoMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Screenshot export: render bare, no nav/footer ── */}
      {pathname === "/export-pages" ? (
        children
      ) : (
        <>
          {/* ── Top nav ── */}
          <header
            data-public-header
            className="sticky top-0 z-50 bg-[#0A1628]/97 backdrop-blur-md border-b border-white/10"
            style={{
              background: "rgba(10,22,40,0.97)",
              borderBottom: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
              {/* Logo */}
              <Link href="/" className="flex items-center shrink-0">
                <MyAircraftLogo variant="light" height={28} />
              </Link>

              {/* Desktop links */}
              <nav className="hidden md:flex items-center gap-1 flex-1">
                {navLinks.map((l) => {
                  const active = pathname === l.href;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`px-3.5 py-2 rounded-lg text-[13px] transition-colors ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-white/60 hover:text-white hover:bg-white/8"
                      }`}
                      style={{ fontWeight: active ? 600 : 400 }}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </nav>

              {/* CTA buttons */}
              <div className="hidden md:flex items-center gap-2 shrink-0">
                {/* Demo dropdown */}
                <div className="relative" ref={demoMenuRef}>
                  <button
                    onClick={() => setShowDemoMenu(!showDemoMenu)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                    style={{ fontWeight: 500 }}
                  >
                    <Zap className="w-3.5 h-3.5 text-yellow-400" />
                    Live Demo
                  </button>
                  {showDemoMenu && (
                    <div className="absolute top-full right-0 mt-2 w-52 bg-[#0d1f3c] border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50">
                      <div className="p-2">
                        <Link
                          href="/app"
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                          style={{ fontWeight: 500 }}
                        >
                          <MyAircraftLogo variant="light" height={16} />
                          <div>
                            <div className="text-[13px]" style={{ fontWeight: 600 }}>Owner Demo</div>
                            <div className="text-[10px] text-white/30">Aircraft owner view</div>
                          </div>
                        </Link>
                        <Link
                          href="/app/mechanic"
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                          style={{ fontWeight: 500 }}
                        >
                          <Wrench className="w-4 h-4 text-white/60" />
                          <div>
                            <div className="text-[13px]" style={{ fontWeight: 600 }}>Mechanic Demo</div>
                            <div className="text-[10px] text-white/30">A&P / IA portal</div>
                          </div>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  href="/login?preview=1"
                  className="px-4 py-2 rounded-lg text-[13px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup?preview=1"
                  className="px-4 py-2 rounded-lg text-[13px] bg-[#2563EB] hover:bg-[#1d4ed8] text-white transition-colors shadow-md shadow-[#2563EB]/25"
                  style={{ fontWeight: 600 }}
                >
                  Get started
                </Link>
              </div>

              {/* Mobile hamburger */}
              <button
                className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70"
                onClick={() => setOpen((o) => !o)}
                aria-label="Toggle menu"
              >
                {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {/* Mobile menu */}
            {open && (
              <div className="md:hidden border-t border-white/10 bg-[#0A1628] px-4 py-3 space-y-1">
                {navLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 rounded-lg text-[14px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    {l.label}
                  </Link>
                ))}
                <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
                  <Link
                    href="/app"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    <MyAircraftLogo variant="light" height={16} />
                    Owner Demo
                  </Link>
                  <Link
                    href="/app/mechanic"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[14px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    <Wrench className="w-4 h-4 text-white/60" />
                    Mechanic Demo
                  </Link>
                  <Link
                    href="/login?preview=1"
                    onClick={() => setOpen(false)}
                    className="block text-center px-4 py-2.5 rounded-lg text-[14px] text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup?preview=1"
                    onClick={() => setOpen(false)}
                    className="block text-center px-4 py-2.5 rounded-lg text-[14px] bg-[#2563EB] text-white"
                    style={{ fontWeight: 600 }}
                  >
                    Get started — free
                  </Link>
                </div>
              </div>
            )}
          </header>

          {/* ── Page content ── */}
          <main className="flex-1">
            {children}
          </main>

          {/* ── Footer ── */}
          <footer className="bg-[#0A1628] border-t border-white/10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-8 mb-12">
                {/* Brand */}
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 mb-4">
                    <MyAircraftLogo variant="light" height={24} />
                  </div>
                  <p className="text-white/35 text-[13px] leading-relaxed mb-4 max-w-xs">
                    Aircraft records intelligence platform for owners, A&P mechanics, IAs, and fleet operators. AI-powered answers from your actual logbooks.
                  </p>
                  <div className="flex items-center gap-2 text-white/25 text-[11px]">
                    <span>Not affiliated with the FAA or any government agency.</span>
                  </div>
                </div>

                {/* Product */}
                <div>
                  <p className="text-white/50 text-[11px] uppercase tracking-widest mb-4" style={{ fontWeight: 700 }}>
                    Product
                  </p>
                  <ul className="space-y-2.5">
                    {[
                      { label: "Features",      href: "/features" },
                      { label: "Pricing",       href: "/pricing" },
                      { label: "Scanning",      href: "/scanning" },
                      { label: "Owner Demo",    href: "/app" },
                      { label: "Mechanic Demo", href: "/app/mechanic" },
                    ].map((l) => (
                      <li key={l.href}>
                    <Link href={l.href} className="text-white/40 hover:text-white/80 text-[13px] transition-colors">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Company */}
                <div>
                  <p className="text-white/50 text-[11px] uppercase tracking-widest mb-4" style={{ fontWeight: 700 }}>
                    Company
                  </p>
                  <ul className="space-y-2.5">
                    {[
                      { label: "About",   href: "/about" },
                      { label: "Blog",    href: "/blog" },
                      { label: "Contact", href: "/contact" },
                    ].map((l) => (
                      <li key={l.href}>
                    <Link href={l.href} className="text-white/40 hover:text-white/80 text-[13px] transition-colors">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                    <li><span className="text-white/25 text-[13px]">Careers</span></li>
                  </ul>
                </div>

                {/* Legal */}
                <div>
                  <p className="text-white/50 text-[11px] uppercase tracking-widest mb-4" style={{ fontWeight: 700 }}>
                    Legal
                  </p>
                  <ul className="space-y-2.5">
                    {[
                      { label: "Privacy Policy",   href: "/privacy" },
                      { label: "Terms of Service", href: "/terms" },
                    ].map((l) => (
                      <li key={l.href}>
                    <Link href={l.href} className="text-white/40 hover:text-white/80 text-[13px] transition-colors">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                    <li><span className="text-white/25 text-[13px]">Security</span></li>
                    <li><span className="text-white/25 text-[13px]">Cookie Policy</span></li>
                  </ul>
                </div>
              </div>

              <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                <p className="text-white/25 text-[12px]">
                  © {new Date().getFullYear()} myaircraft.us — All rights reserved.
                </p>
                <div className="flex items-center gap-4">
                  <Link href="/signup" className="text-[#2563EB] hover:text-[#60a5fa] text-[12px] transition-colors" style={{ fontWeight: 500 }}>
                    Start free trial →
                  </Link>
                </div>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
