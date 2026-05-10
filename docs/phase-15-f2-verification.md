# Phase 15 F2 — Verification

**Date:** 2026-05-09
**Tester:** Claude (Chrome MCP)
**Account:** `andy@horf.us` (`is_platform_admin: true` after migration 114, `membership.role: owner`, `profile.persona: null`)

## Conclusion

🔴 **F2 is REAL but the cause is different from the original Phase 15 framing.**

The Phase 15 owner walkthrough recorded F2 as "persona-strict guards
bypassed for platform admin." After investigation, the actual cause is:

**There are no route-level persona guards at all.** Not for any user.
Owner persona can reach mechanic-only routes via direct URL navigation
because nothing in the app router or middleware checks the active
persona before rendering. `is_platform_admin = true` is incidental;
the bypass would happen for any owner-persona member of any org.

This means F2 isn't a guard that an admin escapes — it's a guard that
**doesn't exist yet** on these routes. The `PERSONA_CONFIG.hiddenModules`
array drives sidebar nav visibility (good — owner doesn't see Scheduler
in the nav), but a user who knows the URL hits the page directly with
no challenge.

## Verification probes

State at probe time:
- `andy@horf.us`, `is_platform_admin: true`, `profile.persona: null`,
  `membership.role: owner`
- Persona switcher highlighted **Owner** in the top-left
- Three persona-disallowed routes per `phase-15-test-plan.md`:
  `/scheduler`, `/work-orders`, `/clock`

| Route | Expected (per persona contract) | Observed | Result |
|---|---|---|---|
| `/scheduler` | redirect to `/my-aircraft` | full month-view calendar, "+ New shift" button visible, no redirect | 🔴 bypassed |
| `/work-orders` | redirect to `/my-aircraft` | tabbed shell (Work Orders / Estimates / Invoices / Logbook), demo WO `WO-2026-DEMO` visible, "+ New" button | 🔴 bypassed |
| `/clock` | redirect to `/my-aircraft` | "Clock In/Out" page, Today/Week/All filter tabs, empty state "No clock events" | 🔴 bypassed |

In every case the page rendered the full mechanic-targeted UI. URL did
not change. No redirect. No error.

## Root cause

`grep -rn` across `apps/web/app/` for `persona === 'owner' ||
'mechanic'` / `isModuleHidden` / `hiddenModules` finds **zero**
references inside `(app)/scheduler/`, `(app)/work-orders/`,
`(app)/clock/`, `(app)/time-off/`, `(app)/tools/` page files. The
persona system is enforced only at:

1. Sidebar nav rendering (`AppLayout.tsx` filters items via
   `PERSONA_CONFIG.hiddenModules`).
2. The Phase 13.2 PersonaAwareUploadModal's category × document_type
   matrix (server-side enforced).
3. A few inline `persona === 'owner'` branches in form components for
   placeholder copy.

None of these guard the route itself. A logged-in member with
`active_persona = owner` can hand-type any tenant-scoped URL and
the page renders.

## Why `is_platform_admin` doesn't matter

Migration 114 elevated `andy@horf.us` to platform admin between Phase
15 and this re-test. The bypass behavior is identical pre- and
post-elevation. If the bypass were caused by an admin short-circuit,
removing admin status would re-enable the redirect — but Phase 15
recorded the same bypass under the non-admin version of the same
account. So the admin-override hypothesis is wrong.

The bypass affects ALL owner-persona users in production. (The fact
that no real owner customer has noticed is because A) sidebar nav
hides the links, and B) there are no real owner customers on the
production org yet — only the platform admin's own QA org.)

## Implications for the original "view-as" fix path

The Phase 15.5 brief's CASE A proposed a view-as mode for admins, on
the assumption that guards existed and admin needed an explicit way to
skip them. With the real cause known:

- View-as mode is not a fix for F2 by itself. It's a separate feature
  (admin QA convenience).
- The fix for F2 is to add route-level persona guards — which is a
  multi-route refactor that wasn't in this prompt's scope.

Recommendation: defer both to a dedicated sprint (likely "Phase 16.x
persona-strict route enforcement"). The persona system already has
`PERSONA_CONFIG.hiddenModules` — the right shape is probably a
`requirePersona(allowed: Persona[])` server-component helper that
mirrors `requireRole(ADMIN_AND_ABOVE)`, plus a single-line guard at
the top of each persona-restricted page.

## Files referenced in conclusion

- `apps/web/lib/persona/config.ts` — PERSONA_CONFIG source of truth
- `apps/web/components/redesign/AppLayout.tsx` — sidebar persona filtering
- `apps/web/lib/auth/require-role.ts` — pattern to mirror
- `docs/phase-15-test-plan.md` — original persona contract (owner
  disallowed list)
- `docs/phase-15-owner-walkthrough.md` — original F2 capture under
  the non-admin andy@horf.us session

## Appendix: a single-line guard sketch (for the future sprint)

```typescript
// apps/web/lib/auth/require-persona.ts
export async function requirePersona(allowed: readonly Persona[]) {
  const { membership, profile } = await requireAppServerSession()
  const persona = resolvePersona(membership?.persona, profile?.persona)
  if (!allowed.includes(persona)) {
    redirect(PERSONA_CONFIG[persona].homeRoute)
  }
}

// at the top of apps/web/app/(app)/scheduler/page.tsx, etc.
await requirePersona(['mechanic', 'shop', 'admin'])
```

Plus an opt-in admin "view-as" cookie that, when set + the user is
truly `is_platform_admin`, lets `requirePersona` use the picked
persona instead of the underlying. That's the actual scope of CASE A
once the guards exist.
