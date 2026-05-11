# v2 Backlog

Items deliberately deferred from v1 phases. Each item lists the original
finding source, the scope of work, and any dependencies. Curate this
file before each phase planning session.

## 🟢 CLOSED — Persona-strict route enforcement (Phase 18 Sprint 18.4, 2026-05-10)

**Closure:** Phase 18 Sprint 18.4 added `apps/web/lib/persona/route-guard.ts`
with `requirePersona(allowed: Persona[])` returning an allow/redirect
decision, plus `requirePersonaApi(allowed)` returning a 403 NextResponse
for API routes. Guards now run server-side on:

- `/scheduler` (shop, admin)
- `/work-orders/*` (shop, admin) via `(app)/work-orders/layout.tsx`
- `/clock`, `/time-off`, `/tools` (shop, admin)
- `/my-aircraft`, `/aircraft/*` (owner, admin)

Admin view-as is honored: the `mau_view_as_persona` cookie is read by
`getEffectivePersona()` ONLY when `truePersona === 'admin'`. Phase 18
Sprint 18.6 added `POST /api/persona/switch` as the single durable
write path for the cookie (httpOnly, sameSite=lax) and for non-admin
`user_profiles.persona` updates. The client switcher does a full-page
`window.location.assign(homeRoute)` after the POST so the server always
sees the new effective persona on the next request.

Tests: `apps/web/lib/persona/route-guard.test.ts` covers the matrix
(true-persona-only paths, admin view-as=owner/shop, malformed cookie,
self-view-as, non-admin cookie ignored).

**Verification:** Production smoke walk recorded in
`docs/phase-18-ui-refactor-report.md` (Sprint 18.7 section).

Historical context follows for the record.

---

### Original F2 finding (kept for history)

**Source:** `docs/phase-15-f2-verification.md`

**Finding:** F2 is real — `/scheduler`, `/work-orders`, `/clock`,
`/time-off`, and `/tools` are reachable by any owner-persona user via
direct URL navigation. The persona system is enforced only at sidebar
nav rendering and the Phase 13.2 PersonaAwareUploadModal — not at the
route boundary.

**Why deferred:**
- Phase 15.5's prompt scoped Task 2 as a CASE A build (admin view-as
  mode) on the assumption that guards existed and admin needed to skip
  them. That premise was wrong; there are no guards to skip.
- Adding the missing guards is a multi-route refactor that should ship
  as one focused sprint, not bolted onto cleanup.
- No real owner customers have hit the bypass yet (sidebar hides the
  links + production org count = 3 + only the platform admin's QA org
  has enough activity).

**Scope when this lands:**
1. `apps/web/lib/auth/require-persona.ts` — server-component helper
   mirroring `requireRole(ADMIN_AND_ABOVE)`:

   ```typescript
   export async function requirePersona(allowed: readonly Persona[]) {
     const { membership, profile } = await requireAppServerSession()
     const persona = resolvePersona(membership?.persona, profile?.persona)
     if (!allowed.includes(persona)) redirect(PERSONA_CONFIG[persona].homeRoute)
   }
   ```

2. Single-line guard at the top of each persona-restricted page:
   - `app/(app)/scheduler/page.tsx` — `requirePersona(['mechanic', 'shop', 'admin'])`
   - `app/(app)/work-orders/page.tsx` — same
   - `app/(app)/clock/page.tsx` — same
   - `app/(app)/time-off/page.tsx` — same
   - `app/(app)/tools/page.tsx` — same
   - Plus owner-only routes if any exist (e.g. /economics)

3. View-as mode (the CASE A spec from Phase 15.5):
   - `apps/web/lib/persona/view-as.ts`
   - Cookie-driven persona override for `is_platform_admin = true` users
   - `ViewAsPicker` component in admin nav
   - `ViewAsBanner` at top of every non-/admin page when active
   - `requirePersona` honors view-as cookie when caller is admin
   - Audit log every view-as set/clear

4. Tests:
   - Owner persona blocked from each restricted page (302 → /my-aircraft)
   - Mechanic persona allowed
   - Admin without view-as: still gated
   - Admin with view-as=mechanic: allowed
   - Cookie cycle (set/clear)

**Effort estimate:** 1 sprint (~6 hours including tests + smoke).

**Dependencies:** None — can ship independently of Phase 16.

**Trigger:** Either (a) first non-admin owner customer onboards and we
need the guards live, or (b) when Phase 16.4 admin support inbox
needs view-as for cross-org QA.

---

## (Add new v2 deferrals below this line as they accumulate)
