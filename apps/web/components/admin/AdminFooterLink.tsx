"use client";

/**
 * Phase 18 Sprint 18.2 — admin console footer entry.
 *
 * Renders ONLY when user.is_platform_admin === true. Sits in the bottom-
 * left footer area near the user profile card. Click navigates to the
 * admin command center.
 *
 * Hard rule (Section 4 rule 11): admin is NOT in the main persona
 * switcher dropdown. It lives here. Non-admin users never see this link.
 */

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export interface AdminFooterLinkProps {
  /** Whether the current user is a platform admin. */
  isPlatformAdmin: boolean;
  /** Sidebar collapsed state — drives the compact vs expanded layout. */
  collapsed?: boolean;
  /** Optional override; defaults to the unified command-center route. */
  href?: string;
}

export function AdminFooterLink({
  isPlatformAdmin,
  collapsed = false,
  href = "/admin/command-center",
}: AdminFooterLinkProps) {
  if (!isPlatformAdmin) return null;

  return (
    <Link
      href={href}
      data-testid="admin-footer-link"
      className={`flex items-center ${collapsed ? "justify-center px-1 py-2" : "gap-2 px-3 py-2"} text-white/60 hover:text-white hover:bg-white/5 transition-colors border-t border-white/10`}
      title="Admin Console"
    >
      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
      {!collapsed && (
        <span className="text-[11px]" style={{ fontWeight: 600 }}>
          Admin Console
        </span>
      )}
      {!collapsed && <span className="ml-auto text-[10px] text-white/30">→</span>}
    </Link>
  );
}
