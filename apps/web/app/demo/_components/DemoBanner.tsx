"use client";

import Link from "next/link";

export function DemoBanner() {
  return (
    <div className="sticky top-0 z-40 w-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-400 text-amber-950 border-b border-amber-500/40 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[12px] sm:text-[13px]">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-950 text-amber-100 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">
            ● Demo Mode
          </span>
          <span className="font-medium">
            You&apos;re exploring MyAircraft with sample data. No sign-up required.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/signup?preview=1"
            className="rounded-full bg-amber-950 text-amber-50 px-3 py-1 text-[11px] font-semibold hover:bg-amber-900 transition-colors"
          >
            Start free 30-day trial
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-amber-700/40 px-3 py-1 text-[11px] font-semibold hover:bg-amber-200 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
