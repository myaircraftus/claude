"use client";

/**
 * Phase 18 Sprint 18.2 — persona switcher dropdown.
 *
 * Replaces the previous 3-or-4 horizontal-button row with a compact
 * dropdown that:
 *   - Shows ONLY the personas the user actually has memberships for
 *     ({owner, shop}). Admin lives separately in the footer
 *     (AdminFooterLink) and never appears in this dropdown.
 *   - Hides itself entirely if the user has only one of {owner, shop}
 *     (rendering just the current persona label as a static chip).
 *   - On change, calls the parent's onSwitch handler. The parent is
 *     expected to wire to the server action /api/persona/switch (added
 *     in Sprint 18.6) which does a full-page navigation, eliminating
 *     the soft-nav "session vanishes" bug from the old implementation.
 *
 * Visual: collapsed-sidebar mode shows a single icon button that opens
 * a small popover; expanded-sidebar mode shows a fully-labeled
 * dropdown with the persona icon + label.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { ChevronDown, User, Store } from "lucide-react";
import type { Persona } from "@/types";

export interface PersonaSwitcherProps {
  /** Personas the user has memberships for. May include 'admin' — this
   *  component filters it out; admin is surfaced via AdminFooterLink. */
  availablePersonas: ReadonlyArray<Persona>;
  /** Currently active persona. May be 'admin' (we show 'admin' as a
   *  static label in that case — admin-mode is reached via the footer
   *  link, not this dropdown). */
  currentPersona: Persona;
  /** Sidebar collapsed state — drives the compact vs expanded layout. */
  collapsed?: boolean;
  /** Fires when the user selects a different persona from the dropdown.
   *  The receiver should run the server-side switch (see Sprint 18.6). */
  onSwitch: (next: Persona) => void;
}

interface PersonaOption {
  value: Persona;
  label: string;
  Icon: typeof User;
}

const OPTIONS: ReadonlyArray<PersonaOption> = [
  { value: "owner", label: "Owner", Icon: User },
  { value: "shop", label: "Shop", Icon: Store },
] as const;

export function PersonaSwitcher({
  availablePersonas,
  currentPersona,
  collapsed = false,
  onSwitch,
}: PersonaSwitcherProps) {
  const switchable = useMemo(() => {
    // Filter out 'admin' (handled by AdminFooterLink) and anything not in
    // the canonical option set.
    return OPTIONS.filter((o) => availablePersonas.includes(o.value));
  }, [availablePersonas]);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const select = useCallback(
    (next: Persona) => {
      setOpen(false);
      if (next === currentPersona) return;
      onSwitch(next);
    },
    [currentPersona, onSwitch],
  );

  // Single-persona case — no dropdown needed. Render the persona label
  // as a static chip so the UI is still legible.
  if (switchable.length <= 1) {
    const single = switchable[0];
    if (!single) return null; // user has no operational persona (admin-only)
    return (
      <div data-testid="persona-switcher-static" className={collapsed ? "px-1 py-2" : "px-3 py-2"}>
        <div
          className={`flex items-center gap-2 ${collapsed ? "justify-center" : "px-2 py-1.5"} rounded-md bg-white/5 text-white/70`}
        >
          <single.Icon className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && (
            <span className="text-[11px]" style={{ fontWeight: 600 }}>
              {single.label}
            </span>
          )}
        </div>
      </div>
    );
  }

  const current = OPTIONS.find((o) => o.value === currentPersona) ?? switchable[0];
  const CurrentIcon = current.Icon;

  return (
    <div
      ref={ref}
      data-testid="persona-switcher"
      data-tour="persona-switcher"
      className={`relative ${collapsed ? "px-1 py-2" : "px-3 py-2"}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2 px-2 py-1.5 rounded-md bg-white/5 text-white hover:bg-white/10 transition-colors`}
      >
        <span className="flex items-center gap-2">
          <CurrentIcon className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && (
            <span className="text-[11px]" style={{ fontWeight: 600 }}>
              {current.label}
            </span>
          )}
        </span>
        {!collapsed && <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {open && (
        <ul
          role="listbox"
          className={`absolute z-50 mt-1 ${collapsed ? "left-full ml-2 top-0" : "left-3 right-3"} bg-[#0F1E33] border border-white/10 rounded-md shadow-xl overflow-hidden`}
        >
          {switchable.map(({ value, label, Icon }) => {
            const active = value === currentPersona;
            return (
              <li key={value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => select(value)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left transition-colors ${
                    active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                  style={{ fontWeight: active ? 600 : 400 }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                  {active && <span className="ml-auto text-[10px] text-white/40">•</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
