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
 *
 * Phase 18 Sprint 18.6 — clicking this link now POSTs to
 * /api/persona/switch first so any lingering view_as cookie is cleared
 * BEFORE the navigation, then does a full-page nav. Without this, an
 * admin who was view_as=shop and clicked the footer would land on
 * /admin/command-center with view_as=shop still set, breaking guards
 * that read the effective persona.
 */

import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";

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
  const [pending, setPending] = useState(false);

  if (!isPlatformAdmin) return null;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/persona/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: "admin" }),
      });
    } catch (err) {
      // If the cookie clear fails the admin layout will still let them in
      // (it re-checks is_platform_admin server-side), so we just log.
      console.warn("[AdminFooterLink] persona switch failed; navigating anyway", err);
    }
    // Hard nav so the RSC tree fully rebuilds with the new effective persona.
    window.location.assign(href);
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      data-testid="admin-footer-link"
      className={`flex items-center ${collapsed ? "justify-center px-1 py-2" : "gap-2 px-3 py-2"} text-white/60 hover:text-white hover:bg-white/5 transition-colors border-t border-white/10`}
      title="Admin Console"
    >
      {pending ? (
        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
      ) : (
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
      )}
      {!collapsed && (
        <span className="text-[11px]" style={{ fontWeight: 600 }}>
          Admin Console
        </span>
      )}
      {!collapsed && <span className="ml-auto text-[10px] text-white/30">→</span>}
    </a>
  );
}
